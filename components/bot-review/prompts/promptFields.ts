/**
 * Field metadata for the prompt editor — plain-English labels and help.
 *
 * Kept apart from the component so the wording can be read and changed without
 * scrolling through JSX, and so the editor renders from a list rather than
 * eighteen hand-written inputs.
 */

export type FieldKind = "longtext" | "text" | "number" | "list" | "json";

export type FieldSpec = {
  key: string;
  label: string;
  kind: FieldKind;
  help?: string;
  step?: number;
  min?: number;
  max?: number;
  rows?: number;
};

/** The two fields that ARE the prompt. Shown first, full width. */
export const BODY_FIELDS: FieldSpec[] = [
  {
    key: "system_prompt",
    label: "What the bot is told about itself",
    kind: "longtext",
    rows: 16,
    help: "The standing instructions — who it is, how it writes, what it must never do. This is the biggest lever on tone.",
  },
  {
    key: "user_prompt_template",
    label: "What the bot is asked to write each time",
    kind: "longtext",
    rows: 10,
    help: "The per-message brief. Use {{lead.first_name}} style tags to drop in details about the person.",
  },
];

/** Dials. Sensible to change; hard to break the system with. */
export const SETTING_FIELDS: FieldSpec[] = [
  {
    key: "temperature",
    label: "Creativity",
    kind: "number",
    step: 0.05,
    min: 0,
    max: 2,
    help: "0 is repetitive and predictable, 1 is varied. Above about 1.2 it starts to wander.",
  },
  {
    key: "max_tokens",
    label: "Maximum length",
    kind: "number",
    step: 50,
    min: 64,
    max: 8192,
    help: "Roughly 4 characters per token. Too low truncates the message mid-sentence.",
  },
  {
    key: "confidence_threshold",
    label: "Confidence needed to send",
    kind: "number",
    step: 0.01,
    min: 0,
    max: 1,
    help: "Below this score the message is held instead of sent. Raising it sends fewer, safer messages.",
  },
  {
    key: "variant_weight",
    label: "Share of traffic",
    kind: "number",
    step: 5,
    min: 0,
    max: 100,
    help: "When several variants match, how often this one is picked.",
  },
];

/** Guardrails and classification. */
export const RULE_FIELDS: FieldSpec[] = [
  {
    key: "banned_phrases",
    label: "Never say",
    kind: "list",
    help: "One phrase per line. A message containing any of these is rejected before it sends.",
  },
  {
    key: "required_elements",
    label: "Must include",
    kind: "list",
    help: "One per line. A message missing any of these is rejected before it sends.",
  },
  {
    key: "objection_filter",
    label: "Only for these objections",
    kind: "list",
    help: "One per line. Leave empty to use this prompt whatever the objection. Include 'none' to allow leads with no objection.",
  },
  {
    key: "technique_mix",
    label: "Techniques",
    kind: "list",
    help: "One per line. Labelling only — recorded for reporting, not enforced.",
  },
  { key: "story_arc", label: "Story arc", kind: "text", help: "Used to stop the same arc repeating to one lead." },
  { key: "formula", label: "Formula", kind: "text", help: "Labelling only — recorded for reporting." },
  { key: "variant_label", label: "Variant name", kind: "text", help: "Your name for this variant, for reporting." },
  {
    key: "buyer_stage_target",
    label: "Buyer stage",
    kind: "number",
    min: 1,
    max: 5,
    step: 1,
    help: "1–5. Leave empty to match any stage.",
  },
  {
    key: "trust_level_target",
    label: "Trust level",
    kind: "number",
    min: 1,
    max: 6,
    step: 1,
    help: "1–6. Leave empty to match any level.",
  },
  {
    key: "sequence_position",
    label: "Step in the sequence",
    kind: "number",
    step: 1,
    help: "Leave empty to match any step.",
  },
  { key: "notes", label: "Notes", kind: "longtext", rows: 3, help: "For your team. Never sent to anyone." },
];

export const ALL_FIELDS: FieldSpec[] = [...BODY_FIELDS, ...SETTING_FIELDS, ...RULE_FIELDS];

export const FIELD_BY_KEY = new Map(ALL_FIELDS.map((f) => [f.key, f]));

/** A field's label, or the raw column name when it has no spec. */
export function fieldLabel(key: string) {
  return FIELD_BY_KEY.get(key)?.label ?? key;
}

/**
 * Root namespaces the generator supplies. Mirrors TEMPLATE_ROOTS in LP MCP's
 * prompts-core.js.
 *
 * This copy exists ONLY to show an inline warning while typing — an unknown
 * placeholder renders as an empty string at send time with no error anywhere,
 * so catching it as the operator writes is worth a short duplicated list. LP
 * MCP re-checks it and is the authority; if the two ever disagree, the save is
 * refused with the server's message, not silently accepted.
 */
export const TEMPLATE_ROOTS = [
  "lead",
  "lp",
  "nurture",
  "nurture_state",
  "intelligence",
  "engagement",
  "scarcity_real",
];

export function unknownPlaceholders(template: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of String(template ?? "").matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const path = m[1];
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const root = path.split(".")[0] ?? "";
    if (!TEMPLATE_ROOTS.includes(root)) out.push(path);
  }
  return out;
}
