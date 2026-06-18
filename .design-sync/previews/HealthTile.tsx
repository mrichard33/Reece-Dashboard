import { HealthTile } from "reece-dashboard";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

export const Services = () => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 16,
      maxWidth: 560,
    }}
  >
    <HealthTile
      label="LP MCP"
      status="healthy"
      detail="Running · deployed 3h ago"
      lastActivity={minutesAgo(2)}
      helpKey="overview.lpMcp"
    />
    <HealthTile
      label="HL MCP"
      status="warning"
      detail="Deploy stale (>24h)"
      lastActivity={hoursAgo(26)}
      helpKey="overview.hlMcp"
    />
    <HealthTile
      label="Decision Engine"
      status="critical"
      detail="No heartbeat tick in 18m"
      lastActivity={minutesAgo(18)}
      helpKey="overview.heartbeat"
    />
    <HealthTile
      label="Supabase Sync"
      status="neutral"
      detail="Idle — no sync scheduled"
      lastActivity={null}
      helpKey="overview.syncHealth"
    />
  </div>
);
