/**
 * What each funnel stage is supposed to do to a prospect, in plain words.
 * Read-only prose for the Funnel review page and the Strategy tab; the
 * source is the Antifragile Sales System (antifragile-copywriter skill).
 */
import type { JourneyStage, Lever } from "./schema";

export type StageGuide = {
  title: string;
  /** Who is reading, in the buyer-stage words the team uses. */
  reader: string;
  /** The one job messages at this stage must do. */
  job: string;
  /** What it should feel like from the reader's side. */
  shouldFeelLike: string;
  /** Levers that belong here. */
  levers: Lever[];
  /** What must not happen here. */
  mustNot: string;
};

export const STAGE_ORDER: JourneyStage[] = ["awareness", "reactivation", "indoctrination", "positioning", "conversion", "support", "post-sale", "infrastructure"];

export const STAGE_GUIDE: Record<JourneyStage, StageGuide> = {
  awareness: {
    title: "Awareness — entry bridges",
    reader: "A new lead who does not yet feel the problem (Stage 1, Indifferent).",
    job: "Make the problem feel relevant, then critical, then urgent — and say 'you're in the right place'.",
    shouldFeelLike: "A knowledgeable neighbor noticed something about your home and wants you to know.",
    levers: ["relevance", "curiosity"],
    mustNot: "Pitch, price, position Reece, or push for a booking.",
  },
  reactivation: {
    title: "Re-engagement — waking up cold leads",
    reader: "Someone who went quiet weeks or months ago (Stage 1 again).",
    job: "A pattern interrupt or a genuine 'has anything changed?', one curiosity seed, one low-effort reply ask.",
    shouldFeelLike: "Low pressure. A door left open, not a sales push.",
    levers: ["relevance", "curiosity", "hope"],
    mustNot: "Compress, threaten with deadlines, or pile on messages.",
  },
  indoctrination: {
    title: "Indoctrination — building belief",
    reader: "A curious lead exploring the problem (Stage 2).",
    job: "Reveal the secrets, the mistakes and the weak alternatives, so the lead understands the problem the way we do.",
    shouldFeelLike: "Learning something surprising from someone who has seen it go wrong.",
    levers: ["curiosity", "hope", "rapport"],
    mustNot: "Position Reece as the answer yet, or hard-sell.",
  },
  positioning: {
    title: "Positioning — why us",
    reader: "A lead comparing options (Stage 3).",
    job: "Show Reece as the relevant, superior and unique choice — with proof, a flaw we own, and the X factor.",
    shouldFeelLike: "Confident and specific. Numbers, not adjectives.",
    levers: ["positioning", "rapport", "engagement"],
    mustNot: "Re-teach what they already know, or apologise for the price.",
  },
  conversion: {
    title: "Booking and appointments — getting to the visit",
    reader: "A lead who has decided but not yet committed (Stage 4).",
    job: "Remove the one objection in the way, give a real reason to act now, and make the next step obvious.",
    shouldFeelLike: "Direct, warm, and easy. The in-home visit is the natural next move.",
    levers: ["urgency", "engagement", "positioning"],
    mustNot: "Send more education, generic follow-up, or invented urgency.",
  },
  support: {
    title: "Objections and after the visit",
    reader: "A lead with a specific hesitation after seeing the proposal (Stage 4).",
    job: "Acknowledge the exact objection, reframe it with feel-felt-found and the guarantee, then one next step.",
    shouldFeelLike: "Heard, not argued with.",
    levers: ["rapport", "positioning", "urgency"],
    mustNot: "Argue, re-educate, or send the same generic follow-up regardless of the objection.",
  },
  "post-sale": {
    title: "Customers — after the sale",
    reader: "A customer (Stage 5).",
    job: "Validate the decision, keep them informed, celebrate the result, then ask for the review and the referral.",
    shouldFeelLike: "Pride in a good decision, and a company that stays in touch.",
    levers: ["rapport", "hope"],
    mustNot: "Sell, educate, or make them feel like a prospect again.",
  },
  infrastructure: {
    title: "Utility sends",
    reader: "Anyone who asked for a specific thing (a guide, a link, a code).",
    job: "Deliver what was asked for clearly, in our voice, with one next step.",
    shouldFeelLike: "Prompt and tidy.",
    levers: ["engagement"],
    mustNot: "Pad with pitch or break the brand rules.",
  },
};
