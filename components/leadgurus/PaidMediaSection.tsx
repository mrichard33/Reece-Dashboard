import { StatTile } from "@/components/tiles/StatTile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { getLeadGurusSummary } from "@/lib/queries/leadgurus";
import { SpendRevenueTrend } from "./SpendRevenueTrend";
import { num, usd, shortDate } from "@/lib/utils";

/**
 * "Paid Media (Lead Gurus)" overview section — spend/leads/CPL/self-books/demos
 * and attributed gross/net revenue for the latest pulled day, a 30-day
 * spend-vs-revenue trend, and a per-territory breakdown. Server component; reads
 * the `ft_*` tables directly via `getLeadGurusSummary` (same pattern as the
 * other overview rows). Empty `ft_daily_summary` renders a placeholder.
 */
export async function PaidMediaSection() {
  const { latest, trend, territories } = await getLeadGurusSummary(30);

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Paid Media (Lead Gurus)
        <InfoPopover helpKey="paidMedia.section" align="left" />
        {latest && (
          <span className="font-normal normal-case tracking-normal text-slate-400">
            · {shortDate(latest.date)}
          </span>
        )}
      </h2>

      {!latest ? (
        <Card>
          <CardContent>
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No Lead Gurus data yet. The daily pull (n8n &ldquo;I.LG&rdquo; →
              LP-MCP <code>/n8n/leadgurus/daily-pull</code>) populates this once
              LP-MCP is deployed and the workflow runs.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Headline tiles */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
            <StatTile label="Spend" value={usd(latest.total_spend)} helpKey="paidMedia.spend" />
            <StatTile label="Leads" value={num(latest.total_leads)} helpKey="paidMedia.leads" />
            <StatTile label="CPL" value={usd(latest.cost_per_lead)} helpKey="paidMedia.cpl" />
            <StatTile
              label="Self-books"
              value={num(latest.self_book_count)}
              helpKey="paidMedia.selfBooks"
            />
            <StatTile
              label="Cost / self-book"
              value={usd(latest.cost_per_self_book)}
              helpKey="paidMedia.costPerSelfBook"
            />
            <StatTile label="Demos" value={num(latest.demos)} helpKey="paidMedia.demos" />
            <StatTile
              label="Gross rev"
              value={usd(latest.gross_amount)}
              helpKey="paidMedia.grossRevenue"
            />
            <StatTile
              label="Net rev"
              value={usd(latest.net_amount)}
              helpKey="paidMedia.netRevenue"
            />
          </div>

          {/* Trend + territory */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Spend vs revenue (30d)</CardTitle>
                <InfoPopover helpKey="paidMedia.trend" />
              </CardHeader>
              <CardContent>
                <SpendRevenueTrend data={trend} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Territory breakdown</CardTitle>
                <InfoPopover helpKey="paidMedia.territory" />
              </CardHeader>
              <CardContent>
                {territories.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    No territory rows for {shortDate(latest.date)}.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <th className="py-2 pr-3">Territory</th>
                          <th className="py-2 pr-3 text-right">Spend</th>
                          <th className="py-2 pr-3 text-right">Leads</th>
                          <th className="py-2 pr-3 text-right">CPL</th>
                          <th className="py-2 pr-3 text-right">Self-books</th>
                          <th className="py-2 pr-3 text-right">Demos</th>
                          <th className="py-2 text-right">Gross rev</th>
                        </tr>
                      </thead>
                      <tbody>
                        {territories.map((t) => (
                          <tr
                            key={t.territory}
                            className="border-b border-slate-50 last:border-0 dark:border-slate-800/50"
                          >
                            <td className="py-2 pr-3 font-medium text-navy-900 dark:text-white">
                              {t.territory}
                            </td>
                            <td className="py-2 pr-3 text-right tabular">{usd(t.total_spend)}</td>
                            <td className="py-2 pr-3 text-right tabular">{num(t.total_leads)}</td>
                            <td className="py-2 pr-3 text-right tabular">{usd(t.cost_per_lead)}</td>
                            <td className="py-2 pr-3 text-right tabular">
                              {num(t.self_book_count)}
                            </td>
                            <td className="py-2 pr-3 text-right tabular">{num(t.demos)}</td>
                            <td className="py-2 text-right tabular">{usd(t.gross_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}
