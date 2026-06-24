import { ScCard } from "./ScCard";
import { BulletBar } from "./viz/BulletBar";
import { MiniLegend, MarkBar, MarkTick } from "./viz/marks";
import { SC_COLOR } from "./viz/colors";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/** Quality — each rate vs its target, as bullet bars (KO % inverted). */
export function RatesCard({ vm }: { vm: ScorecardVM }) {
  return (
    <ScCard
      id="sc-rates"
      title="Quality — rates vs target"
      lead="Each bar is the actual rate; the upright line is the target. Red means below target — except KO %, where lower is better."
      info={{
        what: "Each rate metric against its target. The tick is the target; the bar is actual; the % figure is the gap.",
        where: "Rates from LP raw data; targets from Edit Goals.",
        fix: "Red trails target. KO % is inverted — lower is better.",
      }}
    >
      <div className="space-y-5 p-5">
        {vm.rates.map((r) => (
          <BulletBar key={r.key} label={r.label} actual={r.actual} target={r.target} higher={r.higher} desc={r.desc} />
        ))}
        <MiniLegend
          items={[
            { mark: <MarkBar color={SC_COLOR.emerald} />, label: "At / ahead of target" },
            { mark: <MarkBar color={SC_COLOR.rose} />, label: "Behind target" },
            { mark: <MarkTick />, label: "Target" },
          ]}
        />
      </div>
    </ScCard>
  );
}
