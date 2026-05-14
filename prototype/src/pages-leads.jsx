// ============ LEADS PAGE ============

function LeadsPage() {
  const t = window.LEAD_TILES;
  const {
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList,
  } = window.Recharts;

  const tiles = [
    { label: 'Leads this week', value: t.week, delta: '+18% vs last week', deltaTone: 'pos' },
    { label: 'Demos booked',    value: t.booked, delta: '+4 vs last week',  deltaTone: 'pos' },
    { label: 'Demos held',      value: t.held,   delta: '7 no-shows',       deltaTone: 'warn' },
    { label: 'Close rate',      value: `${t.close}%`, delta: '+2pp vs prev', deltaTone: 'pos' },
  ];

  const sources = window.LEAD_SOURCES;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Leads"
        subtitle="Inbound performance by source. Compare share, close, time-to-demo, and revenue."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map(s => <StatTile key={s.label} {...s} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title="Source distribution"
          info={{
            what: 'Share of new leads by source over the last 7 days.',
            where: 'public.contacts.source bucketed; share = count / total.',
            fix: 'A sudden drop in any source usually means a tracking pixel or webhook broke. Cross-check with LP MCP logs.',
          }}
        >
          <div className="h-64 flex items-center">
            <div className="w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sources} dataKey="share" nameKey="source" cx="50%" cy="50%" innerRadius={50} outerRadius={88} paddingAngle={2} stroke="none">
                    {sources.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'rgba(15,23,42,0.95)', border: 'none', borderRadius: 8, fontSize: 12, color: '#fff' }}
                    formatter={(v) => [`${v}%`, 'Share']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-1/2 space-y-1.5 pr-2">
              {sources.map(s => (
                <li key={s.source} className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                    <span className="text-slate-700 dark:text-slate-300 truncate">{s.source}</span>
                  </span>
                  <span className="font-semibold tabular text-slate-800 dark:text-slate-200">{s.share}%</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card
          title="Close rate by source"
          info={{
            what: 'Percent of leads from each source that close-won in the last 90 days.',
            where: 'public.opportunities WHERE status = ‘closed_won’ joined to contacts.source, 90d window.',
            fix: 'If Referral drops below 25% something is wrong — that\'s the highest-trust source by design.',
          }}
        >
          <div className="h-64 -ml-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sources} layout="vertical" margin={{ top: 6, right: 24, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="2 3" stroke="rgba(148,163,184,0.18)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="source" tick={{ fill: 'rgb(100,116,139)', fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: 'none', borderRadius: 8, fontSize: 12, color: '#fff' }} formatter={(v) => [`${v}%`, 'Close rate']} />
                <Bar dataKey="close" radius={[0, 4, 4, 0]} barSize={14}>
                  {sources.map((s, i) => <Cell key={i} fill={s.color} />)}
                  <LabelList dataKey="close" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 11, fill: 'rgb(71,85,105)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="Time-to-demo by source"
          info={{
            what: 'Average days between lead creation and first booked demo, by source.',
            where: 'min(appointments.start_at) − contacts.created_at, averaged per source.',
            fix: 'Canvassing >5d means the bridge workflow E.4 is sluggish. Check W0.4/E.4 in Workflows.',
          }}
        >
          <div className="h-64 -ml-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sources} layout="vertical" margin={{ top: 6, right: 24, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="2 3" stroke="rgba(148,163,184,0.18)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="source" tick={{ fill: 'rgb(100,116,139)', fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: 'none', borderRadius: 8, fontSize: 12, color: '#fff' }} formatter={(v) => [`${v} days`, 'TTD']} />
                <Bar dataKey="ttd" radius={[0, 4, 4, 0]} barSize={14} fill="#6588A0">
                  <LabelList dataKey="ttd" position="right" formatter={(v) => `${v}d`} style={{ fontSize: 11, fill: 'rgb(71,85,105)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="Revenue by source"
          info={{
            what: 'Closed-won revenue per source over the last 90 days.',
            where: 'sum(opportunities.value) WHERE closed_won AND closed_at > now()−90d.',
            fix: 'If High-Intent Digital revenue spikes, double-check the attribution — a lot of "Digital" wins were actually Referral with a digital touch.',
          }}
        >
          <div className="h-64 -ml-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sources} layout="vertical" margin={{ top: 6, right: 32, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="2 3" stroke="rgba(148,163,184,0.18)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="source" tick={{ fill: 'rgb(100,116,139)', fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.95)', border: 'none', borderRadius: 8, fontSize: 12, color: '#fff' }} formatter={(v) => [money(v), 'Revenue']} />
                <Bar dataKey="rev" radius={[0, 4, 4, 0]} barSize={14} fill="#0C2340">
                  <LabelList dataKey="rev" position="right" formatter={(v) => money(v)} style={{ fontSize: 11, fill: 'rgb(71,85,105)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card
        title="Abandoned leads"
        info={{
          what: 'Leads that went quiet — no inbound activity in the configured window for their stage.',
          where: 'public.contacts JOIN last_activity_at + stage-specific dormancy thresholds.',
          fix: 'Don\'t mass-blast. Hand the worst-offending ones to a rep manually — automated re-engagement runs on S1.1.',
        }}
        action={<Button variant="outline" size="sm" icon="Download">Export</Button>}
      >
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400">
                <th className="font-medium pb-2 pr-3">Name</th>
                <th className="font-medium pb-2 pr-3">Source</th>
                <th className="font-medium pb-2 pr-3">Days idle</th>
                <th className="font-medium pb-2 pr-3">Current stage</th>
                <th className="font-medium pb-2 pr-3">Last touch</th>
                <th className="font-medium pb-2 pr-3 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {window.ABANDONED_LEADS.map((l, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition">
                  <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-200">{l.name}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{l.source}</td>
                  <td className="py-2 pr-3 tabular">
                    <span className={`font-mono ${l.days > 20 ? 'text-rose-600 font-semibold' : l.days > 10 ? 'text-amber-600' : 'text-slate-600'}`}>{l.days}d</span>
                  </td>
                  <td className="py-2 pr-3"><Badge tone="slate">{l.stage}</Badge></td>
                  <td className="py-2 pr-3 text-slate-500 truncate">{l.last}</td>
                  <td className="py-2 pr-3 text-right">
                    <Button variant="outline" size="sm" icon="Phone">Assign</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

window.LeadsPage = LeadsPage;
