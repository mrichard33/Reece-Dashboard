import { z } from "zod";

/**
 * Shared scorecard-goal validation, imported by BOTH the client GoalEditor and
 * the server action (lib/actions/scorecard.ts). Kept out of the "use server"
 * file because that module may only export async functions.
 */
export const GoalSchema = z.object({
  market: z.string().min(1).default("REECE"),
  monthly_goal_dollars: z.number().min(0),
  working_days: z.number().int().min(1).max(31),
  target_close_pct: z.number().min(0).max(100),
  target_good_rate_pct: z.number().min(0).max(100),
  target_demo_pct: z.number().min(0).max(100),
  target_ko_pct: z.number().min(0).max(100),
  trailing_nsli: z.number().min(0),
});

export type GoalInput = z.input<typeof GoalSchema>;
export type GoalValues = z.infer<typeof GoalSchema>;
