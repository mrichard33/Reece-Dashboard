/**
 * Bot Review — the Lead status card and the "Why" fact chips (2026-10-06).
 *
 * Pure. Every state here comes from the contact's CURRENT GHL tags (HL
 * contacts.tags), read through the canonical lists in contactTags.ts, plus the
 * tag history from agent_actions for the "turned back on" warning.
 */

import {
  BOT_ON_TAG,
  BOT_PAUSE_TAGS,
  BOT_STOP_TAGS,
  EMAIL_OPTOUT_TAGS,
  OUT_OF_AREA_TAGS,
  PHONE_OPTOUT_TAGS,
  hasAny,
} from "./contactTags";
import type { TagEvent } from "./conversation";

export type LeadContact = {
  tags: string[];
  city: string | null;
  state: string | null;
  postal_code: string | null;
  source: string | null;
};

export type LeadRecord = {
  disposition_label: string | null;
  /** Shown when LP has no label for it (Charles Jessup: CXL, label null). */
  disposition_code?: string | null;
  lead_source: string | null;
  lp_branch_id: string | null;
};

export type LeadStatus = {
  bot: "Active" | "Stopped" | "Paused" | "Off";
  serviceArea: { label: "In area" | "Out of area"; zip: string | null };
  reach: Array<{ channel: "Text" | "Phone call" | "Email"; allowed: boolean }>;
  job: { estimateStatus: string | null; market: string | null; source: string | null };
  tags: string[];
  /** One line when the bot was switched back on after an out-of-area or pause. */
  warning: string | null;
  /** False when the HL contact could not be read: the card says so, never guesses. */
  known: boolean;
};

export function buildLeadStatus(input: {
  contact: LeadContact | null;
  lead: LeadRecord | null;
  office: string | null;
  tagEvents: TagEvent[];
}): LeadStatus {
  const tags = (input.contact?.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const bot: LeadStatus["bot"] = hasAny(tags, BOT_STOP_TAGS)
    ? "Stopped"
    : hasAny(tags, BOT_PAUSE_TAGS)
      ? "Paused"
      : tags.includes(BOT_ON_TAG)
        ? "Active"
        : "Off";
  const phoneOut = hasAny(tags, PHONE_OPTOUT_TAGS);

  // The bot turned back on after it was told to stand down.
  let warning: string | null = null;
  const events = [...input.tagEvents].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let standDown: "out of area" | "paused" | null = null;
  for (const e of events) {
    const tag = e.tag.toLowerCase();
    if (e.action === "add_tag" && OUT_OF_AREA_TAGS.includes(tag)) standDown = "out of area";
    else if (e.action === "add_tag" && tag === "suppress-outbound") standDown ??= "paused";
    else if (e.action === "add_tag" && tag === BOT_ON_TAG && standDown) {
      warning =
        standDown === "out of area"
          ? "The bot was turned back on after this lead was marked out of area."
          : "The bot was turned back on after outbound messages were paused.";
    }
  }

  return {
    bot,
    serviceArea: {
      label: hasAny(tags, OUT_OF_AREA_TAGS) ? "Out of area" : "In area",
      zip: input.contact?.postal_code?.trim() || null,
    },
    reach: [
      { channel: "Text", allowed: !phoneOut },
      { channel: "Phone call", allowed: !phoneOut },
      { channel: "Email", allowed: !hasAny(tags, EMAIL_OPTOUT_TAGS) },
    ],
    job: {
      estimateStatus: input.lead?.disposition_label?.trim() || input.lead?.disposition_code?.trim() || null,
      market: input.office?.trim() || input.lead?.lp_branch_id?.trim() || null,
      source: input.lead?.lead_source?.trim() || input.contact?.source?.trim() || null,
    },
    tags: [...tags].sort(),
    warning,
    known: input.contact != null,
  };
}

/** "Edgewater, FL 32132" — whatever parts exist. */
export function placeLabel(c: Pick<LeadContact, "city" | "state" | "postal_code"> | null): string | null {
  if (!c) return null;
  const cityState = [c.city?.trim(), c.state?.trim()].filter(Boolean).join(", ");
  const s = [cityState, c.postal_code?.trim()].filter(Boolean).join(" ");
  return s || null;
}
