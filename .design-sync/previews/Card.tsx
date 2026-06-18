import { Card, CardHeader, CardTitle, CardContent, Badge } from "reece-dashboard";

export const Basic = () => (
  <div style={{ maxWidth: 360 }}>
    <Card>
      <CardHeader>
        <CardTitle>Pipeline Summary</CardTitle>
        <Badge tone="emerald" dot>
          Live
        </Badge>
      </CardHeader>
      <CardContent>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: "#334155", margin: 0 }}>
          312 opportunities in flight across 5 stages. Average age 7 days — two
          stages trending past the 14-day watch line.
        </p>
      </CardContent>
    </Card>
  </div>
);

export const Plain = () => (
  <div style={{ maxWidth: 360 }}>
    <Card>
      <CardContent>
        <p style={{ fontSize: 14, color: "#334155", margin: 0 }}>
          A bare surface — border, rounded corners, and a soft shadow. Compose
          any content inside.
        </p>
      </CardContent>
    </Card>
  </div>
);
