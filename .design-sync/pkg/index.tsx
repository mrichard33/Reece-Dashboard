// Design-system barrel for claude.ai/design. Re-exports the dashboard's
// reusable UI from the real app source via the `@/` alias (resolved by the
// converter's esbuild tsconfig-paths plugin). This is the bundle entry — the
// compiled IIFE assigns every export below to window.ReeceUI.
//
// Scope: UI primitives + presentational tiles/viz. App-wired shell, pages,
// and data-fetching components are intentionally excluded.

export { Button } from "@/components/ui/Button";
export { Badge } from "@/components/ui/Badge";
export { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
export { Skeleton } from "@/components/ui/Skeleton";
export { StatusDot } from "@/components/ui/StatusDot";
export { Tooltip } from "@/components/ui/Tooltip";
export { InfoPopover } from "@/components/help/InfoPopover";
export { StatTile } from "@/components/tiles/StatTile";
export { HealthTile } from "@/components/tiles/HealthTile";
export { AlertTile } from "@/components/tiles/AlertTile";
export { SyncFreshnessBanner } from "@/components/tiles/SyncFreshnessBanner";
export { StageBars } from "@/components/viz/StageBars";
