import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThreadScrollBox } from "../ConversationThread";

/*
 * 2026-10-07 (Revin pattern): at lg+ the thread scrolls in its own box and the
 * page does not grow with it. The box must fill what is left of the column
 * (flex-1 + min-h-0) and scroll on its own (overflow-y-auto), and carry the
 * marker the thread uses to centre a message without moving the page.
 */
describe("ThreadScrollBox", () => {
  it("scrolls on its own at lg and carries the scroll marker", () => {
    const html = renderToStaticMarkup(createElement(ThreadScrollBox, { pending: false }, "thread"));
    const cls = html.match(/class="([^"]+)"/)?.[1]?.split(/\s+/) ?? [];
    expect(cls).toContain("lg:overflow-y-auto");
    expect(cls).toContain("lg:flex-1");
    expect(cls).toContain("min-h-0");
    expect(cls).toContain("thread-scroll");
    expect(html).toContain("data-thread-scroll");
    // Below lg nothing scrolls inside: the page does.
    expect(cls.some((c) => /^overflow-y-(auto|scroll)$/.test(c))).toBe(false);
  });

  it("dims while loading", () => {
    expect(renderToStaticMarkup(createElement(ThreadScrollBox, { pending: true }, "x"))).toContain("opacity-60");
  });
});
