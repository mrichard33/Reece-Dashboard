# design-sync notes — reece-dashboard

This repo is a **Next.js app** (`antifragile-mission-control`), not a packaged
design system. The sync imports a curated subset of its reusable UI to
claude.ai/design (project `ReeceUI`). Scope: UI primitives + presentational
tiles/viz. App-wired shell, pages, and data-fetching components are excluded.

## How the build is wired (important — non-default for an app repo)

- **Scratch DS package** lives at `.design-sync/pkg/` (committed):
  - `index.tsx` — barrel re-exporting the 15 scoped components via the `@/`
    alias. This is the converter's `--entry` (set as `cfg.entry`).
  - `index.d.ts` — trivial `declare const` per component (drives discovery +
    one-line JSDoc). Real prop contracts come from `cfg.dtsPropsFor`, not here.
  - `package.json` — name `reece-dashboard`, `module`+`types` so the converter
    treats `.design-sync/pkg/` as the package root (`PKG_DIR`).
  - `_tw-input.css` — Tailwind v4 input (committed).
  - `styles.css` — **compiled** Tailwind output = `cfg.cssEntry`. **Regenerate
    on every sync** (it's gitignored output), see below.
- `cfg.tsconfig = ../../tsconfig.json` resolves the `@/` alias in esbuild.
- `cfg.srcDir = ../../components` is used only for group/JSDoc enrichment
  (fuzzy-find), NOT for bundling — the barrel `entry` controls what's bundled,
  so the `next/navigation`-coupled shell components never enter the graph.

## Styling — Tailwind v4 must be compiled to static CSS

The components are styled 100% with Tailwind utility classes; there is no
shipped stylesheet. Before every build, recompile:

```
node .ds-sync/node_modules/@tailwindcss/cli/dist/index.mjs \
  -i .design-sync/pkg/_tw-input.css -o .design-sync/pkg/styles.css
```

`_tw-input.css` uses `@import "tailwindcss" source(none)` + explicit `@source`
over `../../components` and `../../app`, so it generates the full utility set
the components use (incl. `dark:` variants, `animate-ping`, `shimmer`). Keep
its `@theme` / `@layer base` blocks in sync with `app/globals.css`.

## Fonts

Inter / Montserrat / JetBrains Mono are **not shipped in the repo**. They load
at runtime via a Google Fonts `@import` prepended in `_tw-input.css` (so it
rides into `_ds_bundle.css`). `cfg.runtimeFontPrefixes` suppresses the
`[FONT_MISSING]` warning for these families. If the brand ever self-hosts
these woff2s, switch to `cfg.extraFonts` instead.

## Groups

Natural groups from enrichment: `general` (Button/Badge/Card*/Skeleton/
StatusDot/Tooltip), `help` (InfoPopover), `tiles`, `viz`. Refinable later via
`cfg.docsMap` category stubs.

## Fixes applied during this sync

- **StageBars component bug** (`components/viz/StageBars.tsx`): segments wrapped
  in a `Tooltip` (inline-flex) had `width: N%` on a non-flex-item `div`, so the
  proportional bar collapsed to content width. Moved the width onto the direct
  flex child (with the Tooltip filling it via `h-full w-full`). This is a real
  app fix, not just a preview fix — the live `/pipelines` bar was affected too.

## Re-sync risks (watch-list)

- **`styles.css` is generated** — never hand-edit; rerun the Tailwind CLI. If
  `app/globals.css` tokens change, update `_tw-input.css` to match or the
  bundle's colors silently drift from the app.
- **`cfg.dtsPropsFor` is hand-maintained** — if a component's props change in
  source, the contract here goes stale silently (nothing cross-checks it).
  Re-read the component when its render or props look off.
- **`AlertTile.issue`** is a hand-mocked shape of the Supabase `ClaudeKnownIssue`
  type (the real type is `import type`, erased at bundle). Keep it aligned if
  that table's columns change.
- New reusable components added to `components/ui|tiles|viz` are **not**
  auto-included — add them to `.design-sync/pkg/index.tsx`, `index.d.ts`, and
  `cfg.dtsPropsFor`.
- Tailwind v4 CLI version is pinned only by `.ds-sync` install — a major TW
  bump could change generated output.
