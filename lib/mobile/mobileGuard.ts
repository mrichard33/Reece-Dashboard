/**
 * Phone-layout guard (2026-09-26).
 *
 * The team uses this dashboard on phones as much as at a desk, and the ruling
 * is that every screen must work on one, always. A layout that only breaks at
 * 390px wide is never seen by whoever builds it on a laptop, so the patterns
 * that broke phone screens in the 2026-09-26 mobile pass are checked here, on
 * every PR, instead of relying on someone remembering to shrink the window.
 *
 * Pure: takes file text, returns findings. `mobileGuard.test.ts` walks the
 * repo. A line that must stay as it is (a TV kiosk, a pannable canvas) says so
 * with a `mobile-ok: <reason>` comment on that line or the line above.
 */

export type MobileFinding = { line: number; rule: string; text: string };

/** Widest fixed box that still fits a 390px phone after a 16px gutter each side. */
export const PHONE_MAX_PX = 358;

// A class token with no breakpoint prefix — `grid-cols-3`, not `sm:grid-cols-3`.
const bare = (pattern: string) => new RegExp(`(?<![\\w:\\-\\[])${pattern}`, "g");

const GRID = bare("grid-cols-(\\d+|\\[[^\\]\\s\"'`]+\\])");
const WIDTH = bare("(min-w|w)-(\\[(\\d+(?:\\.\\d+)?)(px|rem)\\]|(\\d+))(?![\\w\\-/.])");
const RESPONSIVE_GRID = /(?:sm|md|lg|xl|2xl):grid-cols-/;
const RESPONSIVE_WIDTH = /(?:sm|md|lg|xl|2xl):(?:min-)?w-/;

function px(match: RegExpExecArray): number {
  if (match[3] !== undefined) return Number(match[3]) * (match[4] === "rem" ? 16 : 1);
  return Number(match[5]) * 4; // Tailwind spacing scale: w-96 = 24rem = 384px
}

function gridTracks(token: string): number {
  if (!token.startsWith("[")) return Number(token);
  return token.slice(1, -1).split("_").filter(Boolean).length;
}

export function scanForPhoneBreaks(source: string): MobileFinding[] {
  const lines = source.split("\n");
  const out: MobileFinding[] = [];
  const excused = (i: number) => /mobile-ok/.test(lines[i]!) || (i > 0 && /mobile-ok/.test(lines[i - 1]!));

  lines.forEach((text, i) => {
    if (excused(i)) return;
    const line = i + 1;

    // Three or more columns side by side with no phone fallback. Two small
    // tiles fit a phone; three columns of anything real do not.
    if (!RESPONSIVE_GRID.test(text)) {
      for (const m of text.matchAll(GRID)) {
        if (gridTracks(m[1]!) >= 3) out.push({ line, rule: "grid-no-phone-fallback", text: m[0] });
      }
    }

    // A fixed width wider than a phone with no breakpoint override. A table's
    // own min-width is fine — the table rule below checks it sits in a scroller.
    if (!RESPONSIVE_WIDTH.test(text) && !/<table\b/.test(text)) {
      for (const m of text.matchAll(WIDTH)) {
        if (px(m) > PHONE_MAX_PX) out.push({ line, rule: "fixed-width-wider-than-phone", text: m[0] });
      }
    }
  });

  // A data table in a file that never scrolls sideways pushes the whole page
  // off-screen on a phone.
  const tableAt = lines.findIndex((l, i) => /<table\b/.test(l) && !excused(i));
  if (tableAt >= 0 && !/overflow-(x-)?auto|overflow-x-scroll/.test(source)) {
    out.push({ line: tableAt + 1, rule: "table-without-horizontal-scroll", text: "<table" });
  }

  return out;
}
