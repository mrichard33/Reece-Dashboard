import { describe, expect, it } from "vitest";
import {
  buildPrompt, canGeneratePrompt, LANE_LABEL, REPO_LABEL,
  type PromptInput, type ChangeLane,
} from "./buildPrompt";

/**
 * The prompt is the handoff. If it is wrong, a coding agent confidently does the
 * wrong work and the first sign of trouble is a PR nobody wanted. These tests
 * pin the things that would cause that: the marker the dashboard tracks by, the
 * lane never being guessed, and the absence of a decision being stated rather
 * than silently omitted.
 */

const input = (over: Partial<PromptInput> = {}): PromptInput => ({
  id: 42,
  lane: "code",
  repo: "lp",
  title: "Close the build_needed loop",
  summary: "Surface build items in the Command Center.",
  decisionId: null,
  decisionText: null,
  decisionRationale: null,
  category: null,
  area: null,
  evidence: null,
  ref: null,
  ...over,
});

describe("the lane is never guessed", () => {
  it("refuses to build a prompt without one", () => {
    // Three incompatible jobs. A plausible prompt for the wrong one costs more
    // than a button that will not fire.
    expect(() => buildPrompt(input({ lane: null }))).toThrow(/Set the lane/);
  });

  it("canGeneratePrompt gates the button on exactly that", () => {
    expect(canGeneratePrompt({ lane: null })).toBe(false);
    for (const lane of ["code", "agent_rule", "ghl_workflow"] as ChangeLane[]) {
      expect(canGeneratePrompt({ lane })).toBe(true);
    }
  });

  it("every lane has a label, so the picker can never render a blank", () => {
    for (const lane of ["code", "agent_rule", "ghl_workflow"] as ChangeLane[]) {
      expect(LANE_LABEL[lane]).toBeTruthy();
    }
    expect(Object.keys(REPO_LABEL)).toHaveLength(5);
  });
});

describe("the tracking marker", () => {
  it("every lane carries the exact line the dashboard matches on", () => {
    // Phase 3 finds the PR by this string. If a lane drops it, that change can
    // never be linked back and its status silently stops moving.
    for (const lane of ["code", "agent_rule", "ghl_workflow"] as ChangeLane[]) {
      expect(buildPrompt(input({ lane }))).toContain("Change #42");
    }
  });
});

describe("the code lane", () => {
  it("names the repo and the checks that must pass", () => {
    const p = buildPrompt(input({ repo: "lp" }));
    expect(p).toContain("mrichard33/LP-MCP");
    expect(p).toContain("npm test");
  });

  it("uses the DASHBOARD's checks when the repo is the dashboard", () => {
    const p = buildPrompt(input({ repo: "dashboard" }));
    expect(p).toContain("mrichard33/Reece-Dashboard");
    expect(p).toContain("npm run typecheck");
    expect(p).toContain("npm run build");
  });

  it("says so loudly when no repo is set rather than inventing one", () => {
    const p = buildPrompt(input({ repo: null }));
    expect(p).toMatch(/REPO NOT SET/);
    expect(p).not.toContain("mrichard33/");
  });

  it("forbids committing to main, because main auto-deploys", () => {
    expect(buildPrompt(input())).toMatch(/Never commit to `main`/);
  });

  it("tells the agent to stop rather than build something adjacent", () => {
    expect(buildPrompt(input())).toMatch(/do not implement something adjacent/i);
  });
});

describe("provenance", () => {
  it("includes the decision and its rationale when the change came from a ruling", () => {
    const p = buildPrompt(input({
      decisionId: 1884,
      decisionText: "Keep the 48 hour confirmation window",
      decisionRationale: "Shortening it lost appointments in August.",
    }));
    expect(p).toContain("Keep the 48 hour confirmation window");
    expect(p).toContain("claude_decision_log #1884");
    expect(p).toContain("Shortening it lost appointments");
  });

  it("STATES the absence when there is no decision, rather than leaving a gap", () => {
    // The whole 198-item backlog is this shape: captured in a working session
    // with no ruling behind it. A prompt that just omits the section reads as
    // though the context was lost, and invites the agent to invent one.
    const p = buildPrompt(input());
    expect(p).toContain("Provenance");
    expect(p).toMatch(/no Command Center decision behind it/);
    expect(p).toMatch(/if it is ambiguous, say so rather than guessing/);
  });

  it("lists the evidence when there is some", () => {
    const p = buildPrompt(input({
      evidence: [{ type: "decision", ref: "#412", note: "confirmed in August" }],
    }));
    expect(p).toContain("decision #412 — confirmed in August");
  });

  it("omits empty sections instead of printing an empty heading", () => {
    const p = buildPrompt(input({ summary: null, ref: null, area: null, category: null }));
    expect(p).not.toContain("## Classification");
    expect(p).not.toContain("## Referenced by the original item");
    expect(p).not.toContain("## What to build");
  });
});

describe("the agent rule lane", () => {
  it("points at the skill that actually owns the schema", () => {
    const p = buildPrompt(input({ lane: "agent_rule" }));
    expect(p).toContain("reece-agent-rules");
    expect(p).toContain("agent_rules");
  });

  it("carries the reload call — a rule that is never reloaded does nothing", () => {
    expect(buildPrompt(input({ lane: "agent_rule" }))).toContain("reload-rules");
  });

  it("warns that unknown operators fail closed", () => {
    // The single most expensive mistake in this lane: the rule looks right,
    // deploys, and silently never matches.
    expect(buildPrompt(input({ lane: "agent_rule" }))).toMatch(/fail closed/i);
  });

  it("asks for a rollback line", () => {
    expect(buildPrompt(input({ lane: "agent_rule" }))).toMatch(/rollback/i);
  });

  it("does not tell anyone to open a PR — this lane has no GitHub", () => {
    const p = buildPrompt(input({ lane: "agent_rule" }));
    expect(p).not.toMatch(/open the PR/i);
  });
});

describe("the GHL workflow lane", () => {
  it("is explicit that nothing can apply it", () => {
    const p = buildPrompt(input({ lane: "ghl_workflow" }));
    expect(p).toMatch(/Nothing can apply this automatically/);
    expect(p).toMatch(/by hand in\s+the GHL UI/);
  });

  it("requires the canonical code to be verified, not guessed", () => {
    expect(buildPrompt(input({ lane: "ghl_workflow" }))).toMatch(/not guessed from the description/);
  });

  it("tells the agent to stop if the work is really code", () => {
    // Otherwise a mis-guessed lane quietly becomes a GHL guide for a code change.
    expect(buildPrompt(input({ lane: "ghl_workflow" }))).toMatch(/the lane is wrong/);
  });

  it("asks how to undo it", () => {
    expect(buildPrompt(input({ lane: "ghl_workflow" }))).toMatch(/How to undo it/);
  });
});

describe("shape", () => {
  it("leads with the title as an h1 on every lane", () => {
    for (const lane of ["code", "agent_rule", "ghl_workflow"] as ChangeLane[]) {
      expect(buildPrompt(input({ lane }))).toMatch(/^# Close the build_needed loop/);
    }
  });

  it("is deterministic — the same input twice is the same text", () => {
    // The button must be safe to press twice, and a regenerated prompt that
    // differs for no reason makes the version history meaningless.
    expect(buildPrompt(input())).toBe(buildPrompt(input()));
  });
});
