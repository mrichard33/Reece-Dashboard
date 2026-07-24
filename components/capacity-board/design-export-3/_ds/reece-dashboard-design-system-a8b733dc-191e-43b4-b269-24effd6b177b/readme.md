# Reece Dashboard Design System

A design system for **Reece Windows & Doors** — a Florida hurricane-impact window & door company (est. 1972) — and specifically for its internal **"Mission Control"** operations dashboard (the *Antifragile Sales System*). It captures the brand's patriotic navy/red/white identity and the dense, calm, operator-focused dashboard UI built on Next.js 16 + Tailwind v4.

## Sources

This system was reverse-engineered from materials provided by the team. The reader may have access to these — explore them to build richer, more accurate designs:

- **GitHub — `mrichard33/Reece-Dashboard`** (private): the Next.js dashboard. Tokens lifted from `app/globals.css`; components from `components/ui/`, `components/tiles/`, `components/shell/`, `components/viz/`; screens from `app/(dashboard)/*`. Repo: https://github.com/mrichard33/Reece-Dashboard
- Related repos in the same org worth exploring for product context: `Reece-AI-Chatbot`, `window-calculator`, `Window-ROI-Calculator`, `GHL-Chatbot-Dashboard`, `LP-MCP`, `HL-MCP`.
- **Brand assets** (uploaded): circle badge, Florida "state" wordmark, and the "Reece the Window" mascot (2D mark + 3D render).

## What's here (index)

| Path | What |
|---|---|
| `styles.css` | Global entry — `@import`s all tokens + fonts. Consumers link this one file. |
| `tokens/colors.css` | Navy + brick + slate + status palettes; light/dark semantic aliases. |
| `tokens/typography.css` | Inter / Montserrat / JetBrains Mono / Nunito Sans + scale. |
| `tokens/spacing.css` | 4px spacing scale, radii, shadows, layout & motion. |
| `tokens/fonts.css` | Google Fonts `@import` for the four families. |
| `components/core/` | `Button`, `Card`, `Badge`, `StatusDot`, `Tooltip`, `InfoButton`. |
| `components/forms/` | `Input`. |
| `components/tiles/` | `StatTile`, `HealthTile` — dashboard metric cards. |
| `components/viz/` | `StageBars` — pipeline funnel. |
| `ui_kits/mission-control/` | Interactive recreation: login → overview → pipelines → issues. |
| `guidelines/*.card.html` | Foundation specimen cards (Colors / Type / Spacing / Brand). |

Component namespace (for `@dsCard` HTML): `window.ReeceDashboardDesignSystem_a8b733`.

---

## Content Fundamentals

**Voice: two registers.** The company runs two distinct voices, and the type system encodes the split.

1. **Operations UI (the dashboard).** Plain, terse, reassuring, jargon-translated. The product's whole job is to make an MCP/Supabase backend legible to non-engineers. Copy is **sentence case**, present tense, second-/no-person. Labels are short noun phrases: "Leads today", "Open issues", "Supabase sync". Every metric carries a `{ what, where, fix }` help triple written in everyday language — e.g. *what:* "Leads created today across all sources.", *where:* "LP Supabase, synced hourly.", *fix:* "If zero late in the day, trigger Sync now." Severity is named, not color-only: "Healthy", "Watch", "Stalled", "Critical". Empty states are calm and instructive ("No active alerts."). No exclamation points except a literal " !" suffix flagging a count that needs attention. No emoji in the UI.

2. **Consumer/content surface.** Warmer and friendlier (this is where the mascot and Nunito Sans live) — Florida-proud, family-business, "since 1972", neighborly. Still no slang or hype.

**Casing:** Sentence case for body and buttons ("Sync now", "Mark resolved"). UPPERCASE + wide tracking for small structural labels only (card titles, tile labels, eyebrows). Title Case avoided.

**Numbers:** Always tabular (JetBrains Mono) so columns align. Currency as `$1,284,500`; ages as `21d`; relative times as `7 min ago` with an absolute time on hover.

**Tone test:** if a sentence couldn't be said calmly by an operations manager to a teammate at 7am, rewrite it.

---

## Visual Foundations

**Palette.** Patriotic and restrained. **Navy** (`--color-navy-900 #0C2340`, working shade `--color-navy-800 #122739`) is the "chrome" — the sidebar, primary buttons, headings, the brand. **Brick red** (`--color-brick #ED1E24`) is a true accent: destructive actions and the rare emphasis only — it is *never* a background wash. **Slate** is the entire neutral world (text, borders, surfaces). Status uses Tailwind **emerald / amber / rose / sky** for healthy / watch / critical / new. The brand reads as the American flag — navy & red over white — reflecting a 50-year Florida heritage.

**Backgrounds.** Flat. App canvas is `slate-50` (`#f8fafc`); cards are pure white; the sidebar is solid `navy-900`. **No gradients** in the UI (the only gradient anywhere is a subtle shimmer on loading skeletons). No textures, no patterns, no hero imagery inside the operations product. Imagery (logos, mascot) is confined to login, content surfaces and marketing.

**Type.** `Inter` for UI/body (14px base — the app is dense), `Montserrat` for display/headings and uppercase tracked labels (500–700), `JetBrains Mono` for all numbers/IDs/code (tabular), `Nunito Sans` for content/marketing only. Headings are semibold, never thin. Body sits at 14px; secondary text at 11px.

**Spacing & density.** 4px base. The workhorses are `gap-4 / p-4` (16px) for cards and grids, `p-6` (24px) for page padding, `py-3 px-4` (12/16) for card headers. It's an information-dense tool — generous whitespace is spent on grouping (section labels + gaps), not padding.

**Corners.** `6px` (`--radius-md`) on controls (buttons, inputs, badges-square), `8px` (`--radius-lg`) on cards and banners, `full` on pills/badges/avatars/status dots. Nothing is sharp; nothing is pill-shaped except true pills.

**Borders & elevation.** Depth comes from **hairline borders**, not shadow. Cards are `1px solid slate-200` + a barely-there `shadow-sm`. Inner dividers are the lighter `slate-100`. Shadows escalate only for floating UI (tooltips `shadow-lg`, popovers/drawers `shadow-popover`). No heavy/colored drop shadows.

**Cards.** White surface, 8px radius, slate-200 border, soft shadow. Optional `CardHeader` (uppercase Montserrat title left, `InfoButton` right, bottom hairline), then `CardContent` at 16px padding. This card is the atom of the entire dashboard.

**Status language.** A 10px `StatusDot` (emerald/amber/rose pulse with a ping ring; slate static) plus a named `Badge`. The pulsing ring is the system's one piece of "alive" motion. Pipeline health is encoded by *color of bar segments* keyed to average age (green < 7d, amber < 14d, red ≥ 14d).

**Motion.** Minimal and functional. 150–200ms ease (`cubic-bezier(.4,0,.2,1)`) on hovers and the sidebar drawer; a 1.4s status-dot ping; a slow shimmer on skeletons; a spin on the "Sync now" icon while syncing. No bounces, no decorative parallax, no entrance choreography.

**Hover / press.** Buttons darken one navy step on hover (`navy-800 → navy-700`; brick `→ brick-dark`); secondary/ghost get a `slate-50/100` wash. Nav items in the navy sidebar lighten to white text on `navy-800/700`. Focus is a `navy-600` ring (`navy-400` in dark). No scale-on-press.

**Transparency & blur.** Sparingly — only the mobile nav backdrop (`navy-950/50` + a 1px blur). Surfaces themselves are opaque.

**Dark mode.** First-class and persisted. Canvas `slate-950`, cards `slate-900`, borders `slate-800`, muted text `slate-400`, ring `navy-400`. Toggled via `.dark` on `<html>`.

**Imagery vibe.** The mascot render is bright, warm, friendly 3D (blue sky, primary colors). Logos are flat navy/red/white. Keep brand imagery out of the dense UI; it belongs on auth, content and marketing.

---

## Iconography

- **Library: [Lucide](https://lucide.dev)** — the dashboard imports `lucide-react`. Outline style, **2px stroke, round caps/joins, 24px grid**, rendered at 14–18px in the UI. This is the canonical icon set; match its weight and geometry exactly. In these HTML kits Lucide is loaded from CDN (`unpkg.com/lucide`) and drawn as inline SVG.
- **Common glyphs:** `layout-dashboard`, `git-branch`, `workflow`, `bot`, `users`, `calendar`, `alert-triangle`, `alert-circle`, `alert-octagon`, `shield-check`, `cog`, `bell`, `refresh-cw`, `chevron-right`, `eye`/`eye-off`, `sun`/`moon`, `info`, `x`, `menu`.
- **No emoji** anywhere in the operations UI. **No unicode-glyph icons.** The literal " !" suffix on a stat value is the one allowed text-as-flag.
- **No icon font / sprite** in the source — icons are tree-shaken SVG components. When substituting, stay within Lucide; if a needed glyph is missing, pick the closest Lucide icon rather than mixing sets.
- **Logos/brand marks** (`assets/`): `reece-circle-logo.png` (badge), `reece-state-logo.png` (Florida wordmark, use on navy), `reece-logo.png` (compact app glyph for the sidebar), `reece-mascot.png` (2D), `reece-lightning.png` (3D mascot render). These are PNGs — never redraw them as SVG.

---

## Using this system

- Link `styles.css`; everything is CSS custom properties (`--color-navy-800`, `--surface-card`, `--radius-lg`, `--font-display`, …).
- Mount components from `window.ReeceDashboardDesignSystem_a8b733` after loading `_ds_bundle.js`.
- For full screens, copy `ui_kits/mission-control/` as a starting point.
- Stay calm, dense, and plain-spoken. Navy is the brand; red is a scalpel; slate is everything else.
