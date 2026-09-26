# Reece Dashboard — working notes for Claude

## Every screen must work on a phone — always (ruling, 2026-09-26)

The team opens this dashboard on their phones as often as at a desk: executives approve Facebook posts
from `/content`, reps and managers check leads and workflows on the go. A change that looks right on a
laptop and breaks at phone width is not finished. This applies to every new page, component and fix,
not just ones described as "mobile work".

Build mobile-first: the bare Tailwind classes are the phone layout, and `sm:` / `md:` / `lg:` add the
desktop layout on top. Target a 375–390px-wide screen:

- **No sideways page scroll.** Nothing fixed-width wider than ~358px without a breakpoint override
  (`w-full sm:w-[600px]`, not `w-[600px]`).
- **Columns stack.** Three or more columns get a phone fallback (`grid-cols-1 sm:grid-cols-3`). Rows of
  buttons, filters and tabs use `flex-wrap` (or scroll sideways on their own).
- **Wide tables scroll inside themselves.** Wrap them in `overflow-x-auto`, and hide low-value columns
  on phones (`hidden md:table-cell`) where that reads better. `components/leads/LeadsTable.tsx` is the
  pattern.
- **Tappable.** Controls about 32px tall on phones; inputs use 16px text on phones (`text-base
  sm:text-sm`) so iOS does not zoom in on focus.
- **Pop-ups and panels go full-width on phones.** See `components/workflows/EmailPreviewButton.tsx`
  and the Flowchart detail panel, which becomes a bottom sheet below `sm`.
- **Nothing only works on hover.** Anything shown on hover must also work on tap.
- **Smaller padding on phones.** Use `p-4 sm:p-6` rather than a flat `p-6`/`p-8`.
- Long ids, URLs and dollar figures wrap (`break-words` / `break-all`) or truncate. They must never push
  the page wider.

**The guard.** `lib/mobile/mobileGuard.test.ts` runs in `npm test`, and so in CI on every PR. It fails
on the patterns above that can be read from the code: 3+ grid columns with no phone fallback, fixed
widths wider than a phone, and tables with no horizontal scroll. If a line genuinely has to stay as it
is (a pannable canvas, a phone-only card grid), put `mobile-ok: <reason>` on it or on the line above.
Never add the file to the guard's skip list to get green. The TV kiosk (`app/board/tv`) and the
design-export references are the only exemptions.

The guard cannot see everything (overlap, text that clips, a tap target that is too small). Before you
call a UI change done, look at it at phone width: `npm run dev`, then Playwright at 390×844. Chromium is
pre-installed in cloud sessions. Pages behind login need data, so render the component on a scratch
page with sample props, and delete the scratch page before committing.
