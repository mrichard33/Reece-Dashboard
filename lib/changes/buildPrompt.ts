/**
 * Command Center — the prompt a change hands to a coding agent.
 *
 * Pure, no I/O, no React, no LLM call. That is the whole design: the button has
 * to answer instantly and produce the same text twice, and a prompt assembled
 * from a template can be read and corrected. An LLM writing the prompt that
 * drives another LLM is a second place for the brief to drift.
 *
 * The three lanes are genuinely different jobs, not one job with a variable in
 * it, so each gets its own body:
 *   code         → a Claude Code brief: repo, branch, conventions, PR marker.
 *   agent_rule   → a SQL row plus the reload call. No GitHub involved at all.
 *   ghl_workflow → a build guide for a person. Nothing can apply it.
 *
 * Kept in lib/ (not components/) so it is unit-tested directly, like
 * lib/commandCenter/rules.ts.
 */

export type ChangeLane = "code" | "agent_rule" | "ghl_workflow";

export type ChangeRepo = "lp" | "dashboard" | "hl" | "n8n" | "ghl-workflows";

/** What the prompt is built from. Everything optional is genuinely often absent. */
export type PromptInput = {
  id: number;
  lane: ChangeLane | null;
  repo: ChangeRepo | null;
  title: string;
  summary: string | null;
  /** Present only when the change came from a Command Center ruling. */
  decisionId: number | null;
  decisionText: string | null;
  decisionRationale: string | null;
  category: string | null;
  area: string | null;
  /** The AI's evidence behind the decision, when there is one. */
  evidence: { type: string; ref: string; note: string }[] | null;
  /** The item's own free-text ref — a workflow name, a UUID, a canonical code. */
  ref: string | null;
};

/** Repo slug → what a contributor needs to know to work in it. */
const REPO_META: Record<ChangeRepo, { name: string; what: string; checks: string }> = {
  lp: {
    name: "mrichard33/LP-MCP",
    what: "the LP MCP server — sync, the Decision Engine, agentic messaging, memory",
    checks: "npm test (node --test scripts/test-*.js)",
  },
  dashboard: {
    name: "mrichard33/Reece-Dashboard",
    what: "the Next.js dashboard",
    checks: "npm run typecheck && npm run lint && npm test && npm run build",
  },
  hl: {
    name: "mrichard33/HL-MCP",
    what: "the HL MCP server — the GoHighLevel mirror and workflow intelligence",
    checks: "npm run build",
  },
  n8n: {
    name: "mrichard33/n8n",
    what: "the n8n workflow JSON",
    checks: "none — validate the JSON parses",
  },
  "ghl-workflows": {
    name: "mrichard33/GHL-Workflows",
    what: "exported GoHighLevel workflow JSON (read-only mirror)",
    checks: "none",
  },
};

function block(heading: string, body: string | null | undefined): string {
  const text = String(body ?? "").trim();
  return text ? `## ${heading}\n${text}\n` : "";
}

/** The context every lane wants: why this exists and what it is attached to. */
function background(c: PromptInput): string {
  const out: string[] = [];

  if (c.decisionText) {
    out.push(
      block(
        "The decision this implements",
        `${c.decisionText}${c.decisionId ? `\n\n(claude_decision_log #${c.decisionId})` : ""}`,
      ),
    );
    out.push(block("Why it was decided", c.decisionRationale));
  } else {
    // Most of the backlog is like this: a build item captured in a working
    // session, with no ruling behind it. Saying so is better than leaving a gap
    // the reader fills in with an assumption.
    out.push(
      block(
        "Provenance",
        "Captured as a build item during a working session. There is no Command Center decision behind it, so the task description below is the whole brief — if it is ambiguous, say so rather than guessing.",
      ),
    );
  }

  if (c.evidence?.length) {
    out.push(
      block(
        "Evidence the recommendation was based on",
        c.evidence.map((e) => `- ${e.type} ${e.ref}${e.note ? ` — ${e.note}` : ""}`).join("\n"),
      ),
    );
  }

  const tags = [c.area ? `area: ${c.area}` : null, c.category ? `category: ${c.category}` : null]
    .filter(Boolean)
    .join("   ");
  out.push(block("Classification", tags));
  out.push(block("Referenced by the original item", c.ref));

  return out.join("");
}

/** Shared footer: how the dashboard finds the work once it exists. */
function marker(changeId: number): string {
  return `Change #${changeId}`;
}

function codePrompt(c: PromptInput): string {
  const meta = c.repo ? REPO_META[c.repo] : null;
  const repoLine = meta
    ? `${meta.name} — ${meta.what}`
    : "REPO NOT SET — pick the right one before starting, or ask.";
  const checks = meta?.checks ?? "the repo's own checks";

  return `# ${c.title}

${block("What to build", c.summary)}${background(c)}
## Repository
${repoLine}

## How to work
- Branch from the latest \`main\`. Never commit to \`main\` directly — it auto-deploys.
- Keep the change minimal: what this task needs, nothing more. Do not widen it.
- Match the surrounding code's conventions. Read \`CLAUDE.md\` and \`.claude/skills/\` in the repo if they exist, and follow them over anything here.
- Add or update tests for the behaviour you change.

## Before you open the PR
Run and pass:
\`\`\`
${checks}
\`\`\`
If a check was already failing on \`main\`, say so in the PR rather than fixing it here.

## The PR
Put this exact line in the PR body so the Command Center can track it:

\`\`\`
${marker(c.id)}
\`\`\`

Describe what changed and why, and name anything you deliberately left out.

## If this turns out to be wrong
If the task as written is already done, no longer applies, or cannot be done
safely, do not implement something adjacent. Report back with what you found.
`;
}

function agentRulePrompt(c: PromptInput): string {
  return `# ${c.title}

${block("What to change", c.summary)}${background(c)}
## Lane: agent rule — no GitHub

This is a row in the \`agent_rules\` table in LP Supabase, not a code change. It
ships as SQL and takes effect on a rules reload, with no deploy.

**Load the \`reece-agent-rules\` skill before writing anything.** It owns the
schema, the operator vocabulary, and the safety rules, and it is authoritative
over this prompt.

## What is needed
1. The SQL \`insert\`/\`update\` against \`agent_rules\`, with \`rule_key\`,
   \`rule_name\`, \`category\`, \`event_pattern\`, \`conditions\`,
   \`action_template\`, \`requires_approval\`, \`enabled\` and \`priority\`.
2. The reload afterwards:
   \`POST /n8n/decision-engine/reload-rules\`
3. A one-line rollback — usually \`enabled = false\` on the same \`rule_key\`.

## Two things that will bite
- **Unknown condition operators fail closed.** If the rule uses an operator the
  engine does not implement, it silently never matches. Check the operator exists
  in \`evaluateContextConditions\` first; if it does not, the engine change must
  deploy *before* the rule is seeded.
- Anything touching money, live leads, or customer messaging should carry
  \`requires_approval = true\` unless there is a stated reason not to.

## Reference
${marker(c.id)}
`;
}

function ghlWorkflowPrompt(c: PromptInput): string {
  return `# ${c.title}

${block("What to change", c.summary)}${background(c)}
## Lane: GoHighLevel workflow — instructions only

**Nothing can apply this automatically.** GHL workflow edits are made by hand in
the GHL UI. What is wanted here is a build guide precise enough to follow without
re-deriving the decision.

**Load the \`reece-ghl-build-guide\` skill** for the required document format, and
\`reece-workflow-registry\` for canonical codes and naming.

## Produce
1. The workflow's canonical code and name, verified against \`workflow_registry\`
   — not guessed from the description.
2. Numbered steps, each naming the exact trigger, action, or condition to add,
   change, or remove, and where in the workflow it sits.
3. Every decision fork stated explicitly, with the option to take.
4. What to check after publishing to know it worked.
5. How to undo it.

## Do not
Do not propose a code change for this. If the work turns out to belong in LP-MCP
or n8n rather than GHL, say so and stop — the lane is wrong and should be changed
on the card, not worked around.

## Reference
${marker(c.id)}
`;
}

/**
 * Build the prompt for one change.
 *
 * Throws on a missing lane rather than guessing: the three lanes produce
 * incompatible work, and a plausible prompt for the wrong one wastes more time
 * than an empty button.
 */
export function buildPrompt(c: PromptInput): string {
  switch (c.lane) {
    case "code": return codePrompt(c);
    case "agent_rule": return agentRulePrompt(c);
    case "ghl_workflow": return ghlWorkflowPrompt(c);
    default:
      throw new Error("Set the lane before generating a prompt — code, agent rule and GHL workflow are different jobs.");
  }
}

/** Can this change produce a prompt yet? Drives the button's disabled state. */
export function canGeneratePrompt(c: Pick<PromptInput, "lane">): boolean {
  return c.lane === "code" || c.lane === "agent_rule" || c.lane === "ghl_workflow";
}

/** Human labels for the lane, used on the card and in the lane picker. */
export const LANE_LABEL: Record<ChangeLane, string> = {
  code: "Code",
  agent_rule: "Agent rule",
  ghl_workflow: "GHL workflow",
};

export const REPO_LABEL: Record<ChangeRepo, string> = {
  lp: "LP-MCP",
  dashboard: "Dashboard",
  hl: "HL-MCP",
  n8n: "n8n",
  "ghl-workflows": "GHL-Workflows",
};
