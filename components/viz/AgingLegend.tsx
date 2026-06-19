/** Color key for the aging tints used across the stage bars. */
export function AgingLegend() {
  const items = [
    { label: "< 7d", cls: "bg-emerald-500" },
    { label: "7–14d", cls: "bg-amber-500" },
    { label: "> 14d", cls: "bg-rose-500" },
  ];
  return (
    <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-sm ${i.cls}`} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
