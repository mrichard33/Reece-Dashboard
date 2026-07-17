// Plain-language definitions for every term & symbol on the scorecard. Source of
// truth for both the Glossary card and the inline <Term> tooltips (via SC_DEFS).

export type GlossaryGroup = {
  group: string;
  items: { term: string; def: string }[];
};

export const SC_GLOSSARY: GlossaryGroup[] = [
  {
    group: "Funnel & counts",
    items: [
      { term: "Set", def: "Appointments set with prospects — the top of the funnel." },
      { term: "Issued", def: "Leads issued to reps to go work." },
      { term: "Net Issue", def: "Issued leads after removing cancellations and duplicates." },
      { term: "Demos", def: "Completed in-home demonstrations." },
      { term: "Sold", def: "Deals sold (gross, before any fall-out)." },
      { term: "# Net Close", def: "Sold deals that stuck after cancellations." },
    ],
  },
  {
    group: "Rates",
    items: [
      { term: "Close %", def: "Sold ÷ demos — the gross close rate." },
      { term: "% Net Close", def: "Net closes ÷ demos — closes that stuck." },
      { term: "Demo %", def: "Demos ÷ net issued — how many issued leads demo." },
      { term: "Good Rate %", def: "Share of sold dollars that survive (aren’t cancelled) — (sold − cancelled) ÷ sold." },
      { term: "KO %", def: "Knock-off rate — jobs cancelled after the sale. Lower is better." },
    ],
  },
  {
    group: "Revenue",
    items: [
      { term: "Released (Net Sales)", def: "Revenue booked and released — this is what counts toward the goal." },
      { term: "Working (held / Pending)", def: "Sold but held up in financing, HOA or docs — not yet released." },
      { term: "Open quotes", def: "Quoted but not yet a firm order." },
      { term: "Cancelled", def: "Deals that fell out." },
      { term: "Gross Sales", def: "All sold dollars before holds and cancellations — the tie-out total." },
      { term: "Working Rev", def: "Working (held) plus open quotes — revenue still in progress." },
      { term: "Avg sale", def: "Released net sales ÷ number of net closes." },
      { term: "NSLI", def: "Net Sales per Lead Issued — released dollars earned per issued lead." },
      { term: "GSLI", def: "Gross Sales per Lead Issued — gross dollars per issued lead." },
      { term: "Trailing NSLI", def: "An NSLI baseline carried in from prior periods." },
    ],
  },
  {
    group: "Windows & goals",
    items: [
      { term: "MTD", def: "Month to date (also WTD week, QTD quarter, YTD year, PTD custom period)." },
      { term: "Pace goal", def: "The full-period goal prorated to the days elapsed so far." },
      { term: "Provisional", def: "Computed from raw LP data, not yet reconciled to the official report." },
      { term: "NOC", def: "Demos that dropped without an order created." },
      { term: "RTP Await recission", def: "Sold and ready to permit, waiting out the 3-day right-of-rescission window." },
    ],
  },
];

// Flat lookup the inline <Term> control reads.
export const SC_DEFS: Record<string, string> = SC_GLOSSARY.reduce(
  (acc, g) => {
    g.items.forEach((i) => {
      acc[i.term.toLowerCase()] = i.def;
    });
    return acc;
  },
  {
    "good rate": "Share of sold dollars that survive (aren’t cancelled) — (sold − cancelled) ÷ sold.",
    working: "Sold but held up in financing, HOA or docs — not yet released.",
    released: "Revenue booked and released — what counts toward the goal.",
  } as Record<string, string>,
);
