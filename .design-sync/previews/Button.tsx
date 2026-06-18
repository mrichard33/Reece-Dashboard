import { Button } from "reece-dashboard";

export const Variants = () => (
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
    <Button variant="primary">Sync now</Button>
    <Button variant="secondary">Export CSV</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="danger">Delete lead</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button size="sm">Small</Button>
    <Button size="md">Medium</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const Disabled = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button variant="primary" disabled>
      Syncing…
    </Button>
    <Button variant="secondary" disabled>
      Unavailable
    </Button>
  </div>
);
