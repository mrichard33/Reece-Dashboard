import { AlertTile } from "reece-dashboard";

const isoHoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

export const Issues = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 460 }}>
    <AlertTile
      issue={{
        severity: "critical",
        owner: "Ryan",
        description: "Decision Engine heartbeat stalled — no ticks for 18 minutes",
        opened_at: isoHoursAgo(0.3),
      }}
    />
    <AlertTile
      issue={{
        severity: "high",
        owner: "Mark",
        description: "HL MCP deploy is 26h old; workflow pages may be degraded",
        opened_at: isoHoursAgo(4),
      }}
    />
    <AlertTile
      issue={{
        severity: "medium",
        owner: null,
        description: "Namespace drift detected on 3 opportunities in S4.5",
        opened_at: isoHoursAgo(20),
      }}
    />
    <AlertTile
      issue={{
        severity: "low",
        description: "Sync lag exceeded 30m once overnight (auto-recovered)",
        opened_at: isoHoursAgo(9),
      }}
    />
  </div>
);
