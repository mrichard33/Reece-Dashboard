import { usdExact } from "@/lib/utils";
import { CATEGORY_LABEL, type CostCategory, type SpendView } from "@/lib/queries/marketingSpend.core";
import { CATEGORY_COLOR } from "./colors";

/**
 * KPI tiles: Total spend, then one tile per category. The category tiles add
 * up to Total (shapeSpend computes Total as their sum). Company-wide shows only
 * when it has money; Held only for the company view (held is company level).
 */
export function SpendTiles({ view }: { view: SpendView }) {
  const company = view.market === "REECE";
  const cats: CostCategory[] = ["lead_source", "software", "call_center"];
  if (view.tiles.company_wide) cats.push("company_wide");
  if (company) cats.push("held");
  // Disputed (billed but not found) shows only when something is in dispute.
  if (company && view.tiles.disputed) cats.push("disputed");
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
      <Tile label="Total spend" value={view.tiles.total} strong />
      {cats.map((c) => (
        <Tile key={c} label={c === "held" ? "Held (company)" : c === "disputed" ? "Disputed" : CATEGORY_LABEL[c]} value={view.tiles[c]} color={CATEGORY_COLOR[c]} />
      ))}
    </div>
  );
}

function Tile({ label, value, color, strong = false }: { label: string; value: number; color?: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${strong ? "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {color && <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />}
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-1 break-all font-mono tabular text-slate-900 dark:text-slate-100 ${strong ? "text-[17px] font-semibold" : "text-[15px]"}`}>
        {usdExact(value)}
      </div>
    </div>
  );
}
