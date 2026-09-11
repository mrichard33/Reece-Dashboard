/**
 * Prompt editor — reads.
 *
 * Reads go through LP MCP like the writes do, not straight to Supabase. That
 * is a deliberate choice for this table specifically: LP MCP decides what the
 * caller may see, and keeping reads and writes on one surface means the list
 * can never show a prompt the same person would be refused permission to open.
 */

import { promptsApi, type PromptDetail, type PromptListData } from "@/lib/mcp/prompts";

export type PromptListResult =
  | { ok: true; data: PromptListData }
  | { ok: false; error: string };

export type PromptDetailResult =
  | { ok: true; data: PromptDetail }
  | { ok: false; error: string };

export async function getPromptList(actorEmail: string): Promise<PromptListResult> {
  const res = await promptsApi.list(actorEmail);
  return res.ok ? { ok: true, data: res.data } : { ok: false, error: res.error };
}

export async function getPromptDetail(
  actorEmail: string,
  promptId: string,
): Promise<PromptDetailResult> {
  const res = await promptsApi.get(actorEmail, promptId);
  return res.ok ? { ok: true, data: res.data } : { ok: false, error: res.error };
}

/**
 * A prompt's display name. prompt_code is the stable identifier and the thing
 * an operator will recognise from the seed file and from agentic_messages, so
 * it leads; the workflow and channel disambiguate variants of the same code.
 */
export function promptLabel(p: { prompt_code: string; workflow_code: string; channel: string }) {
  return `${p.prompt_code} · ${p.workflow_code} · ${p.channel}`;
}
