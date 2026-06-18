import { Badge } from "reece-dashboard";

export const Tones = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <Badge tone="emerald">Closed Won</Badge>
    <Badge tone="sky">New Lead</Badge>
    <Badge tone="amber">Follow-up</Badge>
    <Badge tone="rose">At Risk</Badge>
    <Badge tone="navy">Demo Set</Badge>
    <Badge tone="brick">Escalated</Badge>
    <Badge tone="slate">Archived</Badge>
  </div>
);

export const WithStatusDot = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <Badge tone="emerald" dot>
      Healthy
    </Badge>
    <Badge tone="amber" dot>
      Stale
    </Badge>
    <Badge tone="rose" dot>
      Down
    </Badge>
  </div>
);
