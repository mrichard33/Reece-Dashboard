import { z } from "zod";

/**
 * Shared scorecard-goal validation, imported by BOTH the client GoalEditor and
 * the server action (lib/actions/scorecard.ts). Kept out of the "use server"
 * file because that module may only export async functions.
 */
export const GoalSchema = z
  .object({
    market: z.string().min(1).default("REECE"),
    // 'dollars' → monthly_goal_dollars is the goal. 'growth_pct' → goal $ is derived
    // at read time from a trailing baseline × (1 + growth_pct/100).
    goal_mode: z.enum(["dollars", "growth_pct"]).default("dollars"),
    monthly_goal_dollars: z.number().min(0),
    growth_pct: z.number().min(-100).max(1000).nullable().default(null),
    working_days: z.number().int().min(1).max(31),
    target_close_pct: z.number().min(0).max(100),
    target_good_rate_pct: z.number().min(0).max(100),
    target_demo_pct: z.number().min(0).max(100),
    target_ko_pct: z.number().min(0).max(100),
    trailing_nsli: z.number().min(0),
    // Optional funnel-stage targets (sql/033). Null = no target (rows render
    // "no target" rather than a bare "—").
    target_issue_pct: z.number().min(0).max(100).nullable().default(null),
    target_net_close_pct: z.number().min(0).max(100).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.goal_mode === "growth_pct" && (v.growth_pct === null || v.growth_pct === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["growth_pct"],
        message: "Growth % is required when goal mode is growth.",
      });
    }
  });

export type GoalInput = z.input<typeof GoalSchema>;
export type GoalValues = z.infer<typeof GoalSchema>;
