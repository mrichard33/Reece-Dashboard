import { Card, CardHeader, CardTitle, InfoPopover } from "reece-dashboard";

// NOTE: the popover opens on click, so the static card shows the (i) trigger
// in its real position — top-right of a tile header. (Recorded in NOTES.md.)

export const InTileHeader = () => (
  <div style={{ maxWidth: 320 }}>
    <Card>
      <CardHeader>
        <CardTitle>Leads Today</CardTitle>
        <InfoPopover helpKey="overview.leadsToday" />
      </CardHeader>
    </Card>
  </div>
);
