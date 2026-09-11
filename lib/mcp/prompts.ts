/**
 * LP MCP prompt-editor REST client.
 *
 * Thin typed wrapper over `/api/bot-feedback/prompts/*`. Shares transport,
 * headers, timeout and error wording with the rest of Bot Review by reusing
 * `lpMcpCall` from ./botFeedback.
 *
 * The dashboard NEVER reads or writes agentic_messaging_prompts directly, even
 * for the list. LP MCP re-resolves the actor against dashboard_users +
 * executives and decides what they may do — the same rule the feedback surface
 * holds to, and it matters more here: this table is read live on every
 * generation, so a write reaches customers on the next message.
 */

import { lpMcpCall, type BotFeedbackResult } from "./botFeedback";

/** Summary row for the prompt list — never the prompt bodies, which are large. */
export type PromptSummary = {
  id: string;
  prompt_code: string;
  workflow_code: string;
  channel: string;
  sequence_position: number | null;
  buyer_stage_target: number | null;
  story_arc: string | null;
  active: boolean;
  version: number;
  variant_label: string | null;
  variant_weight: number | null;
  updated_at: string | null;
  has_draft: boolean;
  draft_updated_at: string | null;
  draft_updated_by: string | null;
  state: "live" | "off";
};

/** The full live row. Loosely typed on purpose — the editor renders whatever
 *  columns LP MCP says are editable rather than a hardcoded list. */
export type PromptRow = Record<string, unknown> & {
  id: string;
  prompt_code: string;
  workflow_code: string;
  channel: string;
  system_prompt: string;
  user_prompt_template: string;
  active: boolean;
  version: number;
};

export type PromptChange = { field: string; from: unknown; to: unknown };

export type PromptDraft = {
  fields: Record<string, unknown> | null;
  note: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type PromptHistoryEntry = {
  id: number;
  at: string;
  actor: string;
  action: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type PromptDetail = {
  prompt: PromptRow;
  draft: PromptDraft | null;
  changes: PromptChange[];
  history: PromptHistoryEntry[];
  editable: string[];
  locked: Record<string, string>;
  canEdit: boolean;
  needsMigration: boolean;
};

export type PromptListData = {
  prompts: PromptSummary[];
  needsMigration: boolean;
  canEdit: boolean;
};

const id = (v: string) => encodeURIComponent(v);

export const promptsApi = {
  list: (actorEmail: string): Promise<BotFeedbackResult<PromptListData>> =>
    lpMcpCall<PromptListData>("/api/bot-feedback/prompts", { method: "GET", actorEmail }),

  get: (actorEmail: string, promptId: string): Promise<BotFeedbackResult<PromptDetail>> =>
    lpMcpCall<PromptDetail>(`/api/bot-feedback/prompts/${id(promptId)}`, {
      method: "GET",
      actorEmail,
    }),

  /** Save the draft. Does NOT touch the live row — nothing reaches customers. */
  saveDraft: (
    actorEmail: string,
    promptId: string,
    body: { fields: Record<string, unknown>; note?: string | null },
  ) =>
    lpMcpCall<{ draft: PromptDraft; changes: PromptChange[]; live: false }>(
      `/api/bot-feedback/prompts/${id(promptId)}/draft`,
      { actorEmail, body },
    ),

  discardDraft: (actorEmail: string, promptId: string) =>
    lpMcpCall<{ discarded: true }>(`/api/bot-feedback/prompts/${id(promptId)}/draft`, {
      method: "DELETE",
      actorEmail,
    }),

  /** Put the draft live. This one DOES reach customers, on the next message. */
  activate: (actorEmail: string, promptId: string, body: { note?: string | null } = {}) =>
    lpMcpCall<{ prompt: PromptRow; version: number; changed: string[] }>(
      `/api/bot-feedback/prompts/${id(promptId)}/activate`,
      { actorEmail, body },
    ),

  /** Restore the version recorded before one change-log entry. */
  rollback: (actorEmail: string, promptId: string, logId: number) =>
    lpMcpCall<{ prompt: PromptRow; version: number }>(
      `/api/bot-feedback/prompts/${id(promptId)}/rollback`,
      { actorEmail, body: { log_id: logId } },
    ),

  /** On/off. Turning one on is validated; turning one off never is. */
  toggle: (actorEmail: string, promptId: string, active: boolean, reason?: string | null) =>
    lpMcpCall<{ prompt: PromptRow }>(`/api/bot-feedback/prompts/${id(promptId)}/toggle`, {
      actorEmail,
      body: { active, reason: reason ?? null },
    }),
};
