/**
 * GroupMe bot ping on every approval decision. Server-only; the bot id never
 * reaches the browser. No-ops (logs a warning) when GROUPME_BOT_ID is unset.
 */

const GROUPME_ENDPOINT = "https://api.groupme.com/v3/bots/post";

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
    });
    if (!res.ok) {
      console.error(`[notify/groupme] ${res.status}: ${await res.text()}`);
    }
  } catch (e) {
    console.error("[notify/groupme] ping failed", e);
  }
}
