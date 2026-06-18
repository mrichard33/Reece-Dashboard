import { StatusDot } from "reece-dashboard";

const Item = ({ status, label }: { status: any; label: string }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155" }}>
    <StatusDot status={status} />
    {label}
  </span>
);

export const Statuses = () => (
  <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
    <Item status="healthy" label="Healthy" />
    <Item status="warning" label="Warning" />
    <Item status="critical" label="Critical" />
    <Item status="neutral" label="Neutral" />
  </div>
);
