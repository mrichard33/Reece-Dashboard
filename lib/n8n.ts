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
 * Every request carries `Authorization: Bearer ${N8N_WEBHOOK_SECRET}`; each n8n
 * webhook verifies it before acting.
 */

export type N8nResult = { queued: boolean; error?: string };

const BASE = process.env.N8N_BASE_URL;
const SECRET = process.env.N8N_WEBHOOK_SECRET;

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
        Authorization: `Bearer ${SECRET}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[n8n] ${path} ${res.status}: ${text}`);
      return { queued: false, error: `n8n responded ${res.status}` };
    }
    return { queued: true };
  } catch (e) {
    console.error(`[n8n] ${path} failed`, e);
    return { queued: false, error: e instanceof Error ? e.message : "n8n request failed" };
  }
}
