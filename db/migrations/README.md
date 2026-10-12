# db/migrations — history, not a queue

**New schema does not go here (Fix 1, 2026-10-12).** Every schema change for the LP Supabase project is a
file in `LP-MCP/supabase/migrations/`, and every change for the HL project is a file in
`HL-MCP/supabase/migrations/`. CI in those repos checks the file on the pull request and applies it on
merge; the database's own migration table is the ledger. Doctrine: `LP-MCP/sql/README.md`.

Why: until this date the dashboard, LP-MCP, n8n, window-calculator and the AI OS loader each kept their
own SQL folder and pasted files into the Supabase SQL editor by hand. The LP database's record of applied
migrations listed 8 entries against hundreds of files. Nobody could say whether the repos and the
databases agreed.

## What is in this folder

The files `0001`–`0026` are the record of what was applied by hand, with their rollbacks. Keep them for
their comments. Two numbers are used twice (`0015`, `0023` has a rollback twin).

| Files | Target project | Status |
|---|---|---|
| 0001–0019, 0022, 0026 | LP (`rcjcgjlqzepicbwhnnjl`) | applied by hand |
| 0020, 0021, 0023, 0025 | HL (`jtlngmcrtqncimtjjzlz`) | applied (0023 through the Supabase MCP, 2026-09-25) |
| 0024 | HL | **NOT applied** per the note in 0023; if still wanted, it becomes `HL-MCP/supabase/migrations/024_*.sql` |

## How to change schema now

1. Write the migration in the owning repo (`LP-MCP` or `HL-MCP`), `supabase/migrations/<version>_<name>.sql`.
2. Open a PR there. CI validates it, and applies it on merge.
3. In this repo, regenerate types if a table the dashboard reads changed: `npm run types:generate:lp` / `:hl`.
