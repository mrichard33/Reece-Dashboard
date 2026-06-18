import { SyncFreshnessBanner } from "reece-dashboard";

// The banner only renders once the worst cache age crosses 2h (warning) / 6h
// (critical); fresh caches render nothing by design.
const isoHoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

export const Critical = () => (
  <div style={{ maxWidth: 560 }}>
    <SyncFreshnessBanner lpLastSync={isoHoursAgo(7)} hlLastSync={isoHoursAgo(8.5)} />
  </div>
);

export const Warning = () => (
  <div style={{ maxWidth: 560 }}>
    <SyncFreshnessBanner lpLastSync={isoHoursAgo(3)} hlLastSync={isoHoursAgo(2.5)} />
  </div>
);
