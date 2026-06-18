import { Skeleton } from "reece-dashboard";

export const LoadingCard = () => (
  <div
    style={{
      maxWidth: 320,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      padding: 16,
      borderRadius: 8,
      border: "1px solid #e2e8f0",
      background: "#ffffff",
    }}
  >
    <Skeleton className="h-4 w-32" />
    <Skeleton className="h-8 w-full" />
    <Skeleton className="h-4 w-48" />
    <Skeleton className="h-4 w-24" />
  </div>
);

export const Shapes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Skeleton className="h-10 w-10 rounded-full" />
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-24" />
    </div>
  </div>
);
