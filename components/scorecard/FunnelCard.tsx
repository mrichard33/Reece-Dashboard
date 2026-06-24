import { ScCard } from "./ScCard";
import { Funnel } from "./viz/Funnel";
import { MiniLegend, MarkBar, MarkDot, MarkChip } from "./viz/marks";
import { SC_COLOR } from "./viz/colors";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/** Where it's leaking — the Set → Issued → Demos → Sold funnel with goal notches. */
export function FunnelCard({ vm }: { vm: ScorecardVM }) {
  return (
    <ScCard
      id="sc-funnel"
      title="Where it's leaking — lead funnel"
      lead="Every step loses people. A bar that falls short of its goal dot is behind plan at that step."
      info={{
        what: "Set → Issued → Demos → Sold for this window. The notch on each bar is the prorated goal; chips between stages are conversion rates.",
        where: "Counts from LP raw data; goals from the plan prorated to days elapsed.",
        fix: "A bar short of its notch is behind plan at that stage — look at the conversion chip above it.",
      }}
    >
      <div className="p-5">
        <Funnel stages={vm.funnel} />
        <MiniLegend
          items={[
            { mark: <MarkBar color={SC_COLOR.navy} />, label: "Actual count (bar)" },
            { mark: <MarkDot />, label: "Prorated goal (dot)" },
            { mark: <MarkChip />, label: "Conversion to next step" },
          ]}
        />
      </div>
    </ScCard>
  );
}
