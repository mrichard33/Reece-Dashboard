"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lpServer, lpService } from "@/lib/supabase/lp";
import { getAccessContext } from "@/lib/auth";
import { fetchPriorMonthsBySource, combineRateMonths } from "@/lib/queries/scorecard";
import {
  largestRemainder,
  redistributeRemainder,
  AllocationError,
  type ShareWeight,
  type Allocation,
} from "@/lib/scorecard/allocation";
import { rollupCompanyGoal } from "@/lib/actions/goalRollup";
import { SCORECARD_MARKETS, OFFICE_SOURCE_CODES, marketLabel } from "@/lib/scorecard/markets";
import { firstOfMonthET } from "@/lib/date/sellingDays";

/**
 * Top-down goal distribution (ruled 2026-08-04): ONE company-wide goal, split
 * across the display markets by trailing-Net-Sales share, largest-remainder
 * in cents (Σ office goals == company goal EXACTLY — asserted).
 *
 * PREVIEW NEVER WRITES — it runs on the read-only anon client (lpServer);
 * only commit/redistribute touch lpService. Commit recomputes the split
 * server-side (the client preview is display-only, never trusted).
 *
 * Lakeland (ruling 2026-08-06): Lakeland is its own display market, so it takes
 * its own trailing share and its allocation writes to its own LAKE_MKT row.
 * A market's allocation still writes to its PRIMARY source row — that matters
 * only for Fort Lauderdale, whose BOCA/MIAMI/RFED rows arrive pre-folded as
 * FTLAU_MKT upstream. No market's goal is zeroed.
 *
 * Overrides: after distribution Mark can still hand-edit an office — that row
 * becomes authoritative, the company figure stays derived Σ offices, and the
 * drift vs the distributed target is SURFACED (variance strip), never silently
 * rebalanced. "Redistribute remainder across untouched offices" is an explicit
 * action recorded as its own audit run (basis 'redistribute_remainder').
 */

export type DistributionPreviewRow = {
  code: string;
  label: string;
  /** Trailing net $ input over the basis window (summed across the market's sources). */
  trailingNetDollars: number;
  share: number;
  allocatedDollars: number;
  /** No trailing history — allocated 0, flagged in the preview, never dropped. */
  zeroHistory: boolean;
};

export type DistributionPreview = {
  ok: boolean;
  error?: string;
  rows?: DistributionPreviewRow[];
  companyGoalDollars?: number;
  goalMonth?: string;
  windowMonths?: number;
  windowStart?: string;
  windowEnd?: string;
};

export type DistributionResult = { ok: boolean; error?: string; distributionId?: string };

const PreviewSchema = z.object({
  companyGoalDollars: z.number().positive("Company goal must be a positive dollar amount."),
  goalMonth: z.string().regex(/^\d{4}-\d{2}-01$/, "goalMonth must be a first-of-month date."),
  windowMonths: z.number().int().min(1).max(24).default(6),
});

type Weights = { weights: ShareWeight[]; windowStart: string; windowEnd: string };

/** Trailing-net weight per DISPLAY market over the last `windowMonths` complete
 *  months (anchor = current ET month; the current partial month never counts). */
async function trailingNetWeights(windowMonths: number): Promise<Weights> {
  const anchor = firstOfMonthET();
  const sb = await lpServer(); // read-only
  const prior = await fetchPriorMonthsBySource(sb, OFFICE_SOURCE_CODES, anchor);

  // Nominal window bounds: the `windowMonths` months ending with the last
  // complete month. Stored with the run so the basis is reproducible.
  const ay = Number(anchor.slice(0, 4));
  const am = Number(anchor.slice(5, 7));
  const end = new Date(Date.UTC(ay, am - 1, 0, 12)); // last day before the anchor month
  const start = new Date(Date.UTC(ay, am - 1 - windowMonths, 1, 12));
  const windowStart = start.toISOString().slice(0, 10);
  const windowEnd = end.toISOString().slice(0, 10);

  const weights = SCORECARD_MARKETS.map((m) => {
    const months = combineRateMonths(m.sources.map((s) => prior.get(s) ?? []));
    const net = months
      .filter((mo) => mo.period_start >= windowStart && mo.period_start <= windowEnd)
      .reduce((a, mo) => a + mo.net, 0);
    return { code: m.code, weight: net };
  });
  return { weights, windowStart, windowEnd };
}

function toPreviewRows(weights: ShareWeight[], allocations: Allocation[]): DistributionPreviewRow[] {
  const byCode = new Map(allocations.map((a) => [a.code, a]));
  return weights.map((w) => {
    const a = byCode.get(w.code);
    return {
      code: w.code,
      label: marketLabel(w.code),
      trailingNetDollars: Math.round(w.weight),
      share: a?.share ?? 0,
      allocatedDollars: (a?.cents ?? 0) / 100,
      zeroHistory: w.weight <= 0,
    };
  });
}

export async function previewGoalDistribution(input: unknown): Promise<DistributionPreview> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };
  const parsed = PreviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { companyGoalDollars, goalMonth, windowMonths } = parsed.data;
  try {
    const { weights, windowStart, windowEnd } = await trailingNetWeights(windowMonths);
    const companyCents = Math.round(companyGoalDollars * 100);
    const allocations = largestRemainder(companyCents, weights);
    return {
      ok: true,
      rows: toPreviewRows(weights, allocations),
      companyGoalDollars,
      goalMonth,
      windowMonths,
      windowStart,
      windowEnd,
    };
  } catch (err) {
    return { ok: false, error: err instanceof AllocationError ? err.message : "Preview failed." };
  }
}

/** Write one distribution run + its office goal rows, then the company rollup. */
async function writeDistribution(opts: {
  goalMonth: string;
  companyCents: number;
  basis: "trailing_net" | "redistribute_remainder";
  windowMonths: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  shares: Record<string, { share: number; trailing_net_dollars: number }>;
  /** FULL allocation map (every display market — locked overrides included on
   *  redistribute runs so the audit row reproduces the whole month). */
  allocations: Record<string, number>;
  /** The display markets whose goal rows this run actually writes. */
  writeCodes: string[];
  editor: string;
}): Promise<DistributionResult> {
  const { goalMonth, companyCents, basis, shares, allocations, editor } = opts;
  const svc = lpService();
  const now = new Date().toISOString();

  // Exactness asserted in the CENTS domain against what storage will hold.
  const storedSum = Object.values(allocations).reduce(
    (a, cents) => a + Math.round((cents / 100) * 100),
    0,
  );
  if (storedSum !== companyCents) {
    return { ok: false, error: `allocation sum ${storedSum}¢ != company goal ${companyCents}¢ — aborted, nothing written.` };
  }

  const { data: distRow, error: distErr } = await svc
    .from("scorecard_goal_distributions")
    .insert({
      goal_month: goalMonth,
      company_goal_cents: companyCents,
      basis,
      basis_window_start: opts.windowStart,
      basis_window_end: opts.windowEnd,
      window_months: opts.windowMonths,
      shares,
      allocations,
      created_by: editor,
    })
    .select("distribution_id")
    .single();
  if (distErr) return { ok: false, error: distErr.message };
  const distributionId = String(distRow.distribution_id);

  // Office rows: each display market's allocation lands ENTIRELY on its
  // PRIMARY source row. Every market except Fort Lauderdale is 1:1 with its
  // code, and FTLAU's BOCA/MIAMI/RFED rows arrive pre-folded upstream — so in
  // practice primary === m.code. No market is zeroed.
  for (const m of SCORECARD_MARKETS) {
    if (!opts.writeCodes.includes(m.code)) continue;
    const primary = m.sources[0] ?? m.code;
    const dollars = (allocations[m.code] ?? 0) / 100;
    const { error: liveErr } = await svc.from("scorecard_goals").upsert(
      {
        market: primary,
        goal_mode: "dollars",
        monthly_goal_dollars: dollars,
        growth_pct: null,
        distribution_id: distributionId,
        updated_by: editor,
        updated_at: now,
      },
      { onConflict: "market" },
    );
    if (liveErr) return { ok: false, error: `${primary}: ${liveErr.message}` };
    const { error: frozenErr } = await svc.from("scorecard_goals_monthly").upsert(
      {
        market: primary,
        goal_month: goalMonth,
        goal_mode: "dollars",
        goal_dollars: dollars,
        growth_pct: null,
        distribution_id: distributionId,
        updated_by: editor,
        updated_at: now,
      },
      { onConflict: "market,goal_month" },
    );
    if (frozenErr) return { ok: false, error: `${primary}: ${frozenErr.message}` };
  }

  // Company stays derived Σ offices — same rollup the goal editor uses.
  const rollupErr = await rollupCompanyGoal(svc, goalMonth, 26, editor, now);
  if (rollupErr) return { ok: false, error: rollupErr };

  revalidatePath("/scorecard");
  return { ok: true, distributionId };
}

export async function commitGoalDistribution(input: unknown): Promise<DistributionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };
  const parsed = PreviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { companyGoalDollars, goalMonth, windowMonths } = parsed.data;
  const editor = ctx.executive?.name ?? ctx.email;

  try {
    // Recompute server-side — never trust a client-held preview.
    const { weights, windowStart, windowEnd } = await trailingNetWeights(windowMonths);
    const companyCents = Math.round(companyGoalDollars * 100);
    const allocations = largestRemainder(companyCents, weights);

    const shares: Record<string, { share: number; trailing_net_dollars: number }> = {};
    const allocMap: Record<string, number> = {};
    for (const a of allocations) {
      const w = weights.find((x) => x.code === a.code);
      shares[a.code] = { share: a.share, trailing_net_dollars: Math.round(w?.weight ?? 0) };
      allocMap[a.code] = a.cents;
    }

    return await writeDistribution({
      goalMonth,
      companyCents,
      basis: "trailing_net",
      windowMonths,
      windowStart,
      windowEnd,
      shares,
      allocations: allocMap,
      writeCodes: SCORECARD_MARKETS.map((m) => m.code),
      editor,
    });
  } catch (err) {
    return { ok: false, error: err instanceof AllocationError ? err.message : (err as Error).message };
  }
}

const RedistributeSchema = z.object({
  goalMonth: z.string().regex(/^\d{4}-\d{2}-01$/),
});

/**
 * The EXPLICIT remainder redistribution: keeps every hand-overridden office
 * exactly as Mark set it, re-splits what's left of the distributed company
 * target across the untouched offices by their ORIGINAL shares. Recorded as
 * its own audit run. Never triggered automatically.
 */
export async function redistributeGoalRemainder(input: unknown): Promise<DistributionResult> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };
  const parsed = RedistributeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid month." };
  const { goalMonth } = parsed.data;
  const editor = ctx.executive?.name ?? ctx.email;

  const sb = await lpServer();
  const { data: dist, error: distErr } = await sb
    .from("scorecard_goal_distributions")
    .select("*")
    .eq("goal_month", goalMonth)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (distErr) return { ok: false, error: distErr.message };
  if (!dist) return { ok: false, error: `No distribution exists for ${goalMonth}.` };

  const allocations = (dist.allocations ?? {}) as Record<string, number>;
  const shares = (dist.shares ?? {}) as Record<string, { share: number; trailing_net_dollars: number }>;
  const companyCents = Number(dist.company_goal_cents) || 0;

  // Current live office goals → which display markets were hand-overridden
  // (stored dollars differ from the run's allocation).
  const primaries = SCORECARD_MARKETS.map((m) => m.sources[0] ?? m.code);
  const { data: liveRows, error: liveErr } = await sb
    .from("scorecard_goals")
    .select("market, monthly_goal_dollars")
    .in("market", primaries);
  if (liveErr) return { ok: false, error: liveErr.message };
  const liveCents = new Map<string, number>();
  for (const r of liveRows ?? []) liveCents.set(String(r.market), Math.round(Number(r.monthly_goal_dollars) * 100));

  const locked: { code: string; cents: number }[] = [];
  const weights: ShareWeight[] = [];
  for (const m of SCORECARD_MARKETS) {
    const primary = m.sources[0] ?? m.code;
    const current = liveCents.get(primary) ?? 0;
    if (current !== (allocations[m.code] ?? 0)) {
      locked.push({ code: m.code, cents: current }); // Mark's override — authoritative
    } else {
      weights.push({ code: m.code, weight: shares[m.code]?.share ?? 0 });
    }
  }
  if (locked.length === 0) {
    return { ok: false, error: "No office differs from the distribution — nothing to redistribute." };
  }

  try {
    const reallocated = redistributeRemainder(companyCents, locked, weights);
    const allocMap: Record<string, number> = {};
    for (const l of locked) allocMap[l.code] = l.cents;
    for (const a of reallocated) allocMap[a.code] = a.cents;

    return await writeDistribution({
      goalMonth,
      companyCents,
      basis: "redistribute_remainder",
      windowMonths: null,
      windowStart: null,
      windowEnd: null,
      shares,
      allocations: allocMap,
      // Only the UNTOUCHED offices are rewritten; overrides stay as-is.
      writeCodes: reallocated.map((a) => a.code),
      editor,
    });
  } catch (err) {
    return { ok: false, error: err instanceof AllocationError ? err.message : (err as Error).message };
  }
}
