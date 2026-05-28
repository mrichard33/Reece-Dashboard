/**
 * Email-on-submit via Resend. Server-only; the API key never reaches the
 * browser. No-ops (logs a warning) when RESEND_API_KEY is unset so the feature
 * works end-to-end before the transactional sender is provisioned.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

type ApprovalEmail = {
  to: string;
  assetTitle: string;
  assetType: string;
  description: string | null;
  requestedBy: string;
  deepLink: string;
};

export async function sendApprovalRequestEmail(msg: ApprovalEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.warn(
      `[notify/email] RESEND_API_KEY/RESEND_FROM unset — skipping email to ${msg.to}`,
    );
    return;
  }

  const html = `
    <p>${escapeHtml(msg.requestedBy)} has requested your approval.</p>
    <p><strong>${escapeHtml(msg.assetTitle)}</strong> (${escapeHtml(msg.assetType)})</p>
    ${msg.description ? `<p>${escapeHtml(msg.description)}</p>` : ""}
    <p><a href="${msg.deepLink}">Open in Executive Review</a></p>
  `;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: msg.to,
        subject: `Approval needed: ${msg.assetTitle}`,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[notify/email] Resend ${res.status}: ${await res.text()}`);
    }
  } catch (e) {
    console.error("[notify/email] send failed", e);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
