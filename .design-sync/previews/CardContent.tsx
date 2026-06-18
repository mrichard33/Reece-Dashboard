import { Card, CardHeader, CardTitle, CardContent } from "reece-dashboard";

export const InContext = () => (
  <div style={{ maxWidth: 360 }}>
    <Card>
      <CardHeader>
        <CardTitle>Leads Today</CardTitle>
      </CardHeader>
      <CardContent>
        <p style={{ fontSize: 30, fontWeight: 600, color: "#0C2340", margin: 0 }}>
          42
        </p>
        <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
          +12% vs yesterday
        </p>
      </CardContent>
    </Card>
  </div>
);
