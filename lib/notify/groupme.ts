/**
 * GroupMe bot ping on every approval decision. Server-only; the bot id never
 * reaches the browser. No-ops (logs a warning) when GROUPME_BOT_ID is unset.
 *
 * TIMEOUT (2026-06-12): capped at 5s via AbortSignal.timeout. Approve/reject
 * actions await this ping, so a slow GroupMe response was able to hang the
 * dashboard's button spinner indefinitely. A notification is never worth
 * blocking the user — on timeout we log and move on.
 */

const GROUPME_ENDPOINT = "https://api.groupme.com/v3/bots/post";
const PING_TIMEOUT_MS = 5_000;

export async function pingGroupMe(text: string): Promise<void> {
  const botId = process.env.GROUPME_BOT_ID;
  if (!botId) {
    console.warn("[notify/groupme] GROUPME_BOT_ID unset — skipping ping");
    return;
  }
  try {
    const res = await fetch(GROUPME_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_id: botId, text }),
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[notify/groupme] ${res.status}: ${await res.text()}`);
    }
  } catch (e) {
    console.error("[notify/groupme] ping failed", e);
  }
}
