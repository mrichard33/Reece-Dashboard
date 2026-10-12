import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WhyCard, nextIssueAnchors } from "../WhyCard";
import type { Issue } from "@/lib/botReview/conversation";

/*
 * 2026-10-12 (Revin pattern): the Why card is one line, collapsed by default,
 * so the thread gets the middle column. The facts chips are gone (Lead status
 * shows them) and the per-issue Jump rows only appear once it is expanded.
 */
const issues: Issue[] = [
  { label: "Sent after outbound paused", tone: "rose", anchor: "b2" },
  { label: "Asked twice", tone: "amber", anchor: "b4" },
  { label: "Sent after outbound paused", tone: "rose", anchor: "b6" },
  { label: "Long reply", tone: "amber", anchor: "b4" },
];

describe("WhyCard", () => {
  it("renders collapsed: one line with the text, the issue count and Next issue", () => {
    const html = renderToStaticMarkup(createElement(WhyCard, { text: "The bot kept texting.", issues }));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("The bot kept texting.");
    expect(html).toContain("4 issues");
    expect(html).toContain("Next issue");
    // No issue list and no Jump rows until it is opened.
    expect(html).not.toContain("Jump");
    expect(html).not.toContain('id="why-details"');
  });

  it("has no facts chips", () => {
    const html = renderToStaticMarkup(createElement(WhyCard, { text: "x", issues }));
    expect(html).not.toContain("<dl");
    expect(html).not.toMatch(/Service area|Estimate|Where/);
  });

  it("hides Next issue when there is nothing to walk", () => {
    const html = renderToStaticMarkup(createElement(WhyCard, { text: "x", issues: [] }));
    expect(html).not.toContain("Next issue");
    expect(html).not.toContain("issue");
  });
});

describe("nextIssueAnchors", () => {
  it("lists each flagged message once, in order", () => {
    expect(nextIssueAnchors(issues)).toEqual(["b2", "b4", "b6"]);
  });

  it("skips empty anchors", () => {
    expect(nextIssueAnchors([{ label: "x", tone: "amber", anchor: "" }])).toEqual([]);
  });
});
