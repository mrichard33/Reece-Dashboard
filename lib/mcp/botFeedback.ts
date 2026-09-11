/**
 * LP MCP Bot Review REST client.
 *
 * The bot-feedback surface is plain REST (`/api/bot-feedback/*`), not MCP
 * tools, so it does not go through lib/mcp/client.ts — that speaks JSON-RPC to
 * `/mcp` and there is nothing to gain from wrapping a POST in a tool call. It
 * reuses the same LP_MCP_URL / LP_MCP_AUTH_TOKEN this deployment already has.
 *
 * Two headers matter on every mutating call:
 *   Authorization: Bearer <LP_MCP_AUTH_TOKEN>   — the service gate
 *   x-actor-email: <the signed-in user>         — WHO is acting
 *
 * The actor header is not a claim about permissions. LP MCP re-resolves that
 * email against dashboard_users + executives with the service role and decides
 * for itself what the person may do (handoff §5). The dashboard cannot grant
 * itself rights by sending a different header, and a caller who forges one
 * still only gets whatever that person was already allowed to do.
 */

const BASE = (process.env.LP_MCP_URL ?? "").trim().replace(/\/+$/, "");
const TOKEN = (process.env.LP_MCP_AUTH_TOKEN ?? "").trim();

/** Bounded so a hung LP MCP never holds a server action open. */
const TIMEOUT_MS = 15_000;

export type BotFeedbackResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string; status?: number };

export const botFeedbackConfigured = BASE.length > 0;

async function call<T>(
  path: string,
  { method = "POST", actorEmail, body }: { method?: "GET" | "POST"; actorEmail: string; body?: unknown },
): Promise<BotFeedbackResult<T>> {
  if (!BASE) {
    return { ok: false, error: "LP_MCP_URL is not set on the dashboard — nothing was saved." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-actor-email": actorEmail,
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    // LP MCP answers { ok, data | error } on every path, including its 4xx, so
    // the body is the source of truth for the message the reviewer sees.
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; data?: T; error?: string; field?: string }
      | null;

    if (!json) {
      return { ok: false, error: `LP MCP returned an unreadable response (${res.status}).`, status: res.status };
    }
    if (json.ok === true) return { ok: true, data: json.data as T };
    return {
      ok: false,
      error: json.error ?? `LP MCP rejected the request (${res.status}).`,
      field: json.field,
      status: res.status,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      // "Nothing was saved" matters: a reviewer who sees a bare error will
      // re-submit, and a double verdict is worse than a clear failure.
      error: aborted
        ? "LP MCP did not answer in time — nothing was saved. Try again."
        : `Could not reach LP MCP — nothing was saved. (${err instanceof Error ? err.message : String(err)})`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `seen_before` is deliberately absent (increment 2 §6B). LP MCP stopped
 * reading it from the request and always writes false; sending it would be a
 * field that looks meaningful and is silently discarded.
 */
export type SubmitFeedbackBody = {
  message_type: string;
  message_ref: string;
  verdict: string;
  reason_codes: string[];
  better_text?: string | null;
  note?: string | null;
  gold: boolean;
  is_calibration?: boolean;
};

export type SubmitFeedbackData = {
  id: number;
  created_at: string;
  counts: boolean;
  context_id: number;
  uncalibrated: boolean;
};

export const botFeedbackApi = {
  submit: (actorEmail: string, body: SubmitFeedbackBody) =>
    call<SubmitFeedbackData>("/api/bot-feedback/feedback", { actorEmail, body }),

  undo: (actorEmail: string, id: number) =>
    call<{ id: number; undone?: boolean; already_undone?: boolean }>(
      `/api/bot-feedback/feedback/${encodeURIComponent(String(id))}/undo`,
      { actorEmail },
    ),

  edit: (actorEmail: string, id: number, body: Omit<SubmitFeedbackBody, "message_type" | "message_ref">) =>
    call<SubmitFeedbackData & { supersedes_id: number }>(
      `/api/bot-feedback/feedback/${encodeURIComponent(String(id))}/edit`,
      { actorEmail, body },
    ),

  /**
   * Remove a review after the undo window has closed (increment 2 §5).
   *
   * The reason is required by LP MCP AND by the DB trigger — this client does
   * not validate it, because a client-side check that disagreed with either
   * gate would be the bug, not the guard.
   */
  retract: (actorEmail: string, id: number, reason: string) =>
    call<{
      id: number;
      already_retracted: boolean;
      retracted_at: string;
      retracted_by: string;
      context_id?: number;
    }>(`/api/bot-feedback/feedback/${encodeURIComponent(String(id))}/retract`, {
      actorEmail,
      body: { reason },
    }),

  /** "Nothing to review here" — one message, or a whole conversation. */
  dismiss: (
    actorEmail: string,
    body: { scope: "message" | "conversation"; context_id?: number; ghl_contact_id?: string; reason?: string | null },
  ) =>
    call<{
      id: number;
      scope: string;
      context_id: number | null;
      ghl_contact_id: string | null;
      reason: string | null;
      dismissed_by: string;
      dismissed_at: string;
      already_dismissed: boolean;
    }>("/api/bot-feedback/dismiss", { actorEmail, body }),

  undoDismiss: (actorEmail: string, id: number) =>
    call<{ id: number; already_undone: boolean }>(
      `/api/bot-feedback/dismiss/${encodeURIComponent(String(id))}/undo`,
      { actorEmail },
    ),

  stopBot: (actorEmail: string, contactId: string, reason?: string) =>
    call<{ action_id: number | null; already_stopped: boolean }>(
      `/api/bot-feedback/lead/${encodeURIComponent(contactId)}/stop-bot`,
      { actorEmail, body: { reason } },
    ),

  calibrationNext: (actorEmail: string) =>
    call<{
      next: { message_type: string; message_ref: string } | null;
      reason?: string;
      progress?: {
        calibration_done: number;
        agreement: number | null;
        calibrated: boolean;
        calibration_target: number;
        agreement_target: number;
      };
    }>("/api/bot-feedback/calibration/next", { method: "GET", actorEmail }),
};
