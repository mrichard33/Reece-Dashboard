import { Tooltip, StatusDot } from "reece-dashboard";

// NOTE: Tooltip reveals its label on hover/focus only, so the bubble is not
// visible in a static screenshot — these cells show the trigger as it sits in
// the UI. (Recorded in .design-sync/NOTES.md.)

export const Triggers = () => (
  <div style={{ display: "flex", gap: 28, alignItems: "center", fontSize: 13, color: "#334155" }}>
    <Tooltip label="Last sync 3 minutes ago">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <StatusDot status="healthy" /> LP cache
      </span>
    </Tooltip>
    <Tooltip label="Deploy is stale — over 24h old">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <StatusDot status="warning" /> HL cache
      </span>
    </Tooltip>
  </div>
);
