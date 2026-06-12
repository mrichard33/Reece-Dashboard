/**
 * Dashboard → n8n webhook trigger. Server-only; the secret never reaches the
 * browser. No-ops (logs a warning, returns { queued:false }) when N8N_BASE_URL /
 * N8N_WEBHOOK_SECRET are unset, so the whole Content area runs offline before the
 * n8n workflows are wired live (Mark's §2 preflight).
 *
 * Webhook paths the Dashboard calls (see n8n/README.md for the contract):
 *   fb-regenerate        — WF3, on component reject (regenerate copy/image)
 *   fb-generate-now      — WF1 on-demand, generate a draft for a date
 *   fb-run-miner         — WF2 on-demand, mine new subtopic proposals
 *   fb-strategic-refresh — future quarterly refresh (stub; documented in README)
 *
 * Every request carries `x-webhook-secret: ${N8N_WEBHOOK_SECRET}`; each n8n
 * webhook verifies it before acting. (A custom header is used rather than
 * `Authorization` because n8n redacts the Authorization header on inbound
 * webhooks — it arrives as `{__redacted:true}`, so the Verify Secret gate can
 * never match against it.)
 *
 * TIMEOUT (2026-06-12): every call is capped at 10s via AbortSignal.timeout.
 * n8n webhooks are expected to respond immediately and run long work in the
 * background (WF3 responds right after its secret check), but if a workflow is
 * ever miswired to respond at the END of a long chain again, this cap keeps the
 * server action — and the user's button spinner — from hanging for minutes.
 */

export type N8nResult = { queued: boolean; error?: string };

const BASE = process.env.N8N_BASE_URL;
const SECRET = process.env.N8N_WEBHOOK_SECRET;

const WEBHOOK_TIMEOUT_MS = 10_000;

export async function postWebhook(
  path: string,
  body: Record<string, unknown>,
): Promise<N8nResult> {
  if (!BASE || !SECRET) {
    console.warn(`[n8n] N8N_BASE_URL/N8N_WEBHOOK_SECRET unset — skipping ${path}`);
    return { queued: false, error: "n8n not configured" };
  }
  try {
    const res = await fetch(`${BASE.replace(/\/$/, "")}/webhook/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": SECRET,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[n8n] ${path} ${res.status}: ${text}`);
      return { queued: false, error: `n8n responded ${res.status}` };
    }
    return { queued: true };
  } catch (e) {
    // A timeout here means the webhook ACCEPTED the request but is responding
    // slowly — the workflow is almost certainly still running. Report queued
    // so the UI doesn't show a false failure for work that's in flight.
    if (e instanceof Error && e.name === "TimeoutError") {
      console.warn(`[n8n] ${path} response exceeded ${WEBHOOK_TIMEOUT_MS}ms — treating as queued`);
      return { queued: true };
    }
    console.error(`[n8n] ${path} failed`, e);
    return { queued: false, error: e instanceof Error ? e.message : "n8n request failed" };
  }
}
