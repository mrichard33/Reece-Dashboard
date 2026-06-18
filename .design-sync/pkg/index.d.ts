// Discovery surface for the converter. These declarations only tell the
// converter WHICH names are components and carry a one-line JSDoc for the
// prompt/README. The real prop contracts come from cfg.dtsPropsFor in
// design-sync.config.json (exact, hand-authored from the component source).

/** Primary action button — primary / secondary / ghost / danger, three sizes. */
export declare const Button: (props: any) => any;
/** Small status pill with an optional leading dot, in seven brand tones. */
export declare const Badge: (props: any) => any;
/** Surface container with a subtle border and shadow; pairs with the Card* parts. */
export declare const Card: (props: any) => any;
/** Card header row — title on the left, actions/info on the right. */
export declare const CardHeader: (props: any) => any;
/** Uppercase, tracked card title in the display font. */
export declare const CardTitle: (props: any) => any;
/** Padded card body region. */
export declare const CardContent: (props: any) => any;
/** Shimmering placeholder block for loading states; size it with className. */
export declare const Skeleton: (props: any) => any;
/** Animated status dot — healthy / warning / critical / neutral. */
export declare const StatusDot: (props: any) => any;
/** Lightweight hover/focus tooltip wrapping any trigger element. */
export declare const Tooltip: (props: any) => any;
/** The (i) info button used on every tile; opens a what/where/fix popover. */
export declare const InfoPopover: (props: any) => any;
/** Headline metric tile — label, big value, optional delta and suffix. */
export declare const StatTile: (props: any) => any;
/** Service-health tile — status dot, detail line, and last-activity time. */
export declare const HealthTile: (props: any) => any;
/** Compact known-issue row with a severity badge and opened-at time. */
export declare const AlertTile: (props: any) => any;
/** Banner warning that cached data is stale past a freshness threshold. */
export declare const SyncFreshnessBanner: (props: any) => any;
/** Horizontal pipeline stage bar with age-tinted segments and a legend. */
export declare const StageBars: (props: any) => any;
