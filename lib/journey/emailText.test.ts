/**
 * The workflow page must show an email as words, not template code
 * (2026-09-26: Email #1 of the chat follow-up read `don&#8217;t` followed by
 * forty `&zwnj;`).
 */
import { describe, expect, it } from "vitest";
import { decodeEntities, emailToPlainText } from "./emailText";

const TEMPLATE = `<!DOCTYPE html><html><head><title>Reece Windows &amp; Doors</title>
<style>.x{color:red}</style></head><body>
<div style="display:none;font-size:1px;max-height:0">The one thing most Florida homeowners don&#8217;t check until it&#8217;s too late. ${"&zwnj;&nbsp;".repeat(40)}</div>
<table><tr><td><p>Hi {{contact.first_name}},</p>


<p>We didn&rsquo;t get to cover this in our chat&hellip;</p>
<p>Reece Windows &amp; Doors</p></td></tr></table>
<!-- footer spacer --></body></html>`;

describe("emailToPlainText", () => {
  it("reads the screenshot template as plain words", () => {
    const { preheader, text } = emailToPlainText(TEMPLATE);
    expect(preheader).toBe("The one thing most Florida homeowners don’t check until it’s too late.");
    expect(text).toBe("Hi {{contact.first_name}},\n\nWe didn’t get to cover this in our chat…\n\nReece Windows & Doors");
  });

  it("never shows entity codes, filler, head or style content", () => {
    const { text } = emailToPlainText(TEMPLATE);
    expect(text).not.toMatch(/&[a-z#0-9]+;/i);
    expect(text).not.toMatch(/[​-‍]/);
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("footer spacer");
    expect(text).not.toMatch(/\n{3,}/);
  });

  it("passes plain SMS text through", () => {
    expect(emailToPlainText("Hi Joy, see you at 3pm.")).toEqual({ preheader: null, text: "Hi Joy, see you at 3pm." });
  });

  it("handles empty input", () => {
    expect(emailToPlainText(null)).toEqual({ preheader: null, text: "" });
    expect(emailToPlainText("")).toEqual({ preheader: null, text: "" });
  });
});

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("A &amp; B &#8217; &#x2019; &lt;b&gt;")).toBe("A & B ’ ’ <b>");
  });
  it("leaves an unknown entity as written", () => {
    expect(decodeEntities("&madeup; &#0;")).toBe("&madeup; &#0;");
  });
  it("decodes once, like a browser", () => {
    expect(decodeEntities("&amp;#8217;")).toBe("&#8217;");
  });
});
