import { StageBars } from "reece-dashboard";

const stages = [
  { name: "New", count: 120, avgAgeDays: 2 },
  { name: "Contacted", count: 84, avgAgeDays: 5 },
  { name: "Demo Set", count: 46, avgAgeDays: 9 },
  { name: "Proposal", count: 23, avgAgeDays: 16 },
  { name: "Won", count: 14, avgAgeDays: 3 },
];

export const Pipeline = () => (
  // Fixed width (not maxWidth) so the bar's `w-full` has a width to fill — the
  // capture mount shrink-wraps a maxWidth-only wrapper to content.
  <div style={{ width: 560 }}>
    <StageBars stages={stages} />
  </div>
);
