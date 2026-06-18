import { Card, CardHeader, CardTitle, Badge } from "reece-dashboard";

export const InContext = () => (
  <div style={{ maxWidth: 360 }}>
    <Card>
      <CardHeader>
        <CardTitle>Open Issues</CardTitle>
        <Badge tone="rose">3 critical</Badge>
      </CardHeader>
    </Card>
  </div>
);
