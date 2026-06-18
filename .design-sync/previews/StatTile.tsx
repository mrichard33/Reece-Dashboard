import { StatTile } from "reece-dashboard";

export const Headline = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 16,
      maxWidth: 540,
    }}
  >
    <StatTile
      label="Leads Today"
      value={42}
      delta="+12% vs yesterday"
      deltaTone="emerald"
      helpKey="overview.leadsToday"
    />
    <StatTile
      label="Appointments"
      value={8}
      suffix=" set"
      delta="−2 vs daily avg"
      deltaTone="rose"
      helpKey="overview.appointmentsToday"
    />
    <StatTile
      label="Opps In Flight"
      value={312}
      delta="steady"
      deltaTone="slate"
      helpKey="overview.oppsInFlight"
    />
    <StatTile
      label="Pending Approvals"
      value={5}
      delta="+3 since 9am"
      deltaTone="amber"
      helpKey="overview.pendingApprovals"
    />
  </div>
);

export const Single = () => (
  <div style={{ maxWidth: 240 }}>
    <StatTile
      label="Close Rate"
      value={23}
      suffix="%"
      delta="+1.4 pts MTD"
      deltaTone="emerald"
      helpKey="overview.oppsInFlight"
    />
  </div>
);
