/**
 * Email HTML → readable plain text (2026-09-26).
 *
 * The workflow page showed template code instead of the email: `&amp;`,
 * `don&#8217;t`, and rows of `&zwnj;` (the invisible filler email builders
 * put after the inbox-preview line so the inbox does not pull body text into
 * it). The old helper stripped tags and `&nbsp;` only, so everything else
 * leaked through. This one decodes every entity, drops the filler, and lifts
 * the hidden preview line out as `preheader` so it is labelled rather than
 * read as the first line of the body.
 *
 * Pure: no I/O, no DOM (it runs in server components). Never throws — an
 * entity it does not know stays as written, which reads better than a guess.
 */

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", sbquo: "‚", bdquo: "„",
  hellip: "…", mdash: "—", ndash: "–", bull: "•", middot: "·", deg: "°",
  copy: "©", reg: "®", trade: "™", times: "×", divide: "÷", frac12: "½",
  laquo: "«", raquo: "»", cent: "¢", pound: "£", euro: "€", sect: "§",
  zwnj: "‌", zwj: "‍", shy: "­", ensp: " ", emsp: " ", thinsp: " ",
};

// Characters a reader cannot see. Email builders pad the preview line with
// them; left in, they render as blank space or, undecoded, as `&zwnj;` soup.
const INVISIBLE = /[​‌‍­͏⁠﻿]/g;

// An element hidden with display:none — in an email that is the preheader.
// Non-greedy and tag-matched: preheaders are one flat element in practice.
const HIDDEN = /<(div|span|p|td|table)\b[^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>([\s\S]*?)<\/\1\s*>/gi;

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

function toText(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(INVISIBLE, "")
    .split("\n")
    .map((line) => line.replace(/[ \t    ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function emailToPlainText(html: string | null | undefined): { preheader: string | null; text: string } {
  if (!html) return { preheader: null, text: "" };
  let preheader: string | null = null;
  const body = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<head\b[\s\S]*?<\/head\s*>/gi, "")
    .replace(/<(title|style|script)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(HIDDEN, (_m, _tag: string, inner: string) => {
      const t = toText(inner).replace(/\s+/g, " ").trim();
      if (!preheader && t) preheader = t;
      return "";
    });
  return { preheader, text: toText(body) };
}
