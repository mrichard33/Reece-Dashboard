/** One-decimal percent with PDF parity ("0.0%"); em-dash for null. */
export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

/** Tone for an actual vs its goal. KO% and similar use lowerIsBetter. */
export function goalTone(
  actual: number | null | undefined,
  goal: number | null | undefined,
  lowerIsBetter = false,
): string {
  if (actual === null || actual === undefined || goal === null || goal === undefined) {
    return "text-slate-800 dark:text-slate-200";
  }
  const meets = lowerIsBetter ? actual <= goal : actual >= goal;
  return meets
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
}
