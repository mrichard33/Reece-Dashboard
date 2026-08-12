# Notion amendment — "Sales Funnel Metrics and Calculation Definitions"

**Status: DRAFTED, NOT APPLIED.** Mark applies this to Notion.

The v4 build contract names that Notion page as the definitional authority.
Amendment A overrides three things it currently says, so until this is applied
**the shipped code and the Notion page are knowingly divergent** — deliberately,
because A5 forbids resolving the contradiction silently in code.

## What to change, and where

| Notion section | Currently says | Change to |
|---|---|---|
| §7 source-of-record table | assigns every funnel metric to Appointment Statistics | split the table by **SCORECARD**, not by metric family — see below |
| §7 callout | "Do not mix appointment columns from 137 into a funnel table" | retire it for the **sales** scorecard; it stands for the call centre |
| §8 grain contract | four facets per metric | five — every row also records its **cohort date** |

## Paste-ready text

> ### A1 · Cohort date follows the department being managed
>
> Then the entire analysis stays attached to that cohort.
>
> | Scorecard | Cohort date | Question it answers |
> |---|---|---|
> | Sales | appointment date | What did the appointments Sales was responsible for produce? |
> | Call centre / setter | set date | What happened to the appointments this setter created? |
>
> A setter creates an appointment on Aug 5 for Aug 12. It belongs to the week of
> Aug 5 on the call-centre scorecard and to the period containing Aug 12 on the
> sales scorecard. Same appointment, two valid views, different cohorts.
>
> **Never mix the two cohort bases inside one KPI.**
>
> ### A2 · The §7 table splits by SCORECARD, not by metric family
>
> Report 137 is filtered on appointment dates, so every one of its columns
> describes the same appointment-date cohort. The sales funnel is sourced from
> it entirely — counts and dollars:
>
> | Metric | Source |
> |---|---|
> | Issued · Demos · Gross Sales count | Report 137 `NumIssued` `NumSat` `NumSale` |
> | Demo % · Demo → Sale % | Report 137, both sides |
> | Gross Written · Cancellations · Financing Denied | Report 137 `GSA` `GSACancelled` `GSACD` |
> | Net Sales $ · Net Retention % | Report 137, by subtraction |
>
> **This retires the §7 callout "do not mix appointment columns from 137 into a
> funnel table" — for the sales scorecard only.** That rule was correct while one
> funnel was being made to serve both departments. Within the sales scorecard,
> 137 counts and 137 dollars are the consistent pair; a sales Issued or Demos
> figure that does not reconcile to the 137 export for the same appointment-date
> range is a defect.
>
> It also dissolves the market-grain blocker. Appointment Statistics is
> Salesrep × Src_id and carries no market column, so market-level Demo % had no
> source. Report 137 By Market has one. Market Demo % and Demo → Sale % now
> render values rather than "unmeasured".
>
> `Set` and `Set → Issued %` do **not** appear on the sales scorecard: 137 has no
> `NumSet` column, and set-count is a call-centre metric under A1.
>
> ### A4 · The two scorecards disagree by design
>
> Same window (8/2–8/8), same setters:
>
> | | Issued | Sat | Gross $ | Sales |
> |---|---|---|---|---|
> | Sales — Report 137 | 446 | 271 | $1,785,626 | 74 |
> | Call centre — Appointment Statistics | 418 | 260 | $1,785,626 | 74 |
>
> Dollars and sales counts tie exactly. The appointment counts do not, and per
> setter the differences run in **both** directions — so it is not a filter
> difference and it will never reconcile. This is **correct**, not a defect:
> different cohorts and different attribution.
>
> Both scorecards carry a visible note naming their cohort basis and source
> report. **Do not build a reconciliation view between them.**
>
> ### A6 · The grain contract records cohort date
>
> Every published metric registers: numerator entity grain · denominator entity
> grain · aggregation grain · source · **cohort date**. A KPI whose numerator and
> denominator carry different cohort dates fails CI.
>
> | Metric | Num | Den | Aggregation | Source | Cohort date |
> |---|---|---|---|---|---|
> | **Sales scorecard** |
> | Demo % | appointment | appointment | market · company | Report 137 | appointment |
> | Demo → Sale % | appointment-sale | appointment-demo | market · company | Report 137 | appointment |
> | Net Retention % | sales dollars | sales dollars | market · company | Report 137 | appointment |
> | Permanent Loss % | sales dollars | sales dollars | market · company | Report 137 | appointment |
> | Net Sales $ | sales dollars | — | market · company | Report 137 | appointment |
> | Net Sales $ per Issued Appointment | sales dollars | appointment | market · company | Report 137 (both sides) | appointment |
> | **Call-centre scorecard — HELD, see A3** |
> | Set → Issued % | appointment | appointment | setter · company | set-date source | set |
> | Company Demo % | appointment | appointment | setter · company | set-date source | set |
> | No Home % | appointment | appointment | setter · company | set-date source | set |
> | One-Leg % | appointment | appointment | setter · company | set-date source | set |
> | LP Sit % | appointment | appointment | setter · company | set-date source | set |
>
> **"Demo %" and "Company Demo %" are different metrics, not two spellings.** On
> 8/2–8/8 they are 60.8% and 62.2%. The sales scorecard renders "Demo %"; the
> call centre owns "Company Demo %".
>
> ### A3 · Date-basis verification — OUTSTANDING
>
> The call-centre scorecard is **held** pending this. Report 137 By Setter is
> appointment-date filtered — it says which setter *originated* appointments that
> *occurred* in the window, not which appointments a setter *created* in it — so
> it is not the right primary source. This page records Appointment Statistics as
> appointment-date filtered in the 2026-08-12 resolution callout and as "issue
> date" in the grain table; **neither is set date, and they cannot both be right
> for one export.**
>
> Steps: render Appointment Statistics as PDF and read the header filter — the
> PDF states filters the CSV omits. If it is not set-date filtered, a set-date
> cohort report must be obtained from LP. **Do not approximate it from an
> appointment-date source.**
>
> **RESULT: _______________________________________________**
> _(fill in before applying — PDF header filter, and how the grain table's
> "issue date" reconciles against the callout's "appointment date")_

## What shipped against this

Reece-Dashboard and LP-MCP, branch `claude/reece-scorecard-v4-ekd6mz`:

- sales funnel sourced from Report 137 at market and company grain; the
  `unmeasured("no market-grain source")` fallback was never built
- `appointment_month` replaces `contract_month`; `contract_month` and
  `net_sales_rate` remain as deprecated view aliases for one release
- the grain contract is enforced data (`lib/scorecard/grainContract.ts`), with
  every call-centre metric registered and **held** citing A3
- "Company Demo %" is a reserved label a sales component may not render
- settled net retention takes a **Net Sales** numerator: 71.10%, not the NSA
  version's 71.06%

## One standing rule worth copying onto the page

**Two exports sharing `SDate`/`EDate` are not thereby on the same date basis.**
Render as PDF — the header states filters the CSV omits. This is how Report 137
was found to be appointment-dated, and why `contract_month` was a misnomer for
as long as it lived.
