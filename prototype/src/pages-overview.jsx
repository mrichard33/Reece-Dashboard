// ============ OVERVIEW PAGE ============

function OverviewPage({ role }) {
  const stats = window.HEADLINE_STATS;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Overview"
        subtitle="Antifragile Mission Control — Reece Windows & Doors operations."
        action={
          <div className="flex items-center gap-2 text-[12px] text-slate-500">
            <Icon name="Clock" size={14} />
            <span className="tabular">Updated 11:47 EST · auto-refresh 30s</span>
          </div>
        }
      />

      {/* Row 1: Service Health */}
      <div>
        <div className="flex items-center gap-1.5 mb-2.5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">Service health</h2>
          <InfoPopover info={{
            what: 'Live status of the four services that keep the agentic system breathing. Any red here means the system can\'t make decisions.',
            where: 'Each tile polls its own /health endpoint at 30s intervals and writes to ops.service_status.',
            fix: 'Click into the tile that\'s red. Most outages here are deploy-related — roll back the last commit if a redeploy doesn\'t fix it.',
          }} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {window.SERVICE_HEALTH.map(t => <ServiceTile key={t.id} tile={t} />)}
        </div>
      </div>

      {/* Row 2: Headline stats */}
      <div>
        <div className="flex items-center gap-1.5 mb-2.5">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">Today</h2>
          <InfoPopover info={{
            what: 'The five numbers a rep or operator should glance at first thing each morning.',
            where: 'Aggregated from public.contacts, public.opportunities, public.appointments, public.approval_queue, public.issues.',
            fix: 'If a number is wildly off (e.g. 0 leads at noon), start by checking Service Health above — sync is the usual culprit.',
          }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {stats.map(s => (
            <StatTile key={s.id}
              label={s.label}
              value={s.value}
              delta={s.delta}
              deltaTone={s.id === 'pending' && s.value > 0 ? 'neg' : s.deltaTone}
              info={s.info}
              suffix={s.id === 'pending' && s.value > 0 ? '!' : undefined}
            />
          ))}
        </div>
      </div>

      {/* Row 3: Activity + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          title="Recent activity"
          className="lg:col-span-2"
          info={{
            what: 'A timeline of the last ~50 system events — lead creation, rule firings, action executions, approval requests, errors.',
            where: 'public.system_events, filtered to the last 4 hours and ordered desc.',
            fix: 'If the feed stops moving for >5 min during business hours, the agent layer is stalled. Check Agent Layer heartbeat.',
          }}
          action={<Button variant="ghost" size="sm" icon="ListFilter">Filter</Button>}
        >
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {window.ACTIVITY_FEED.map((e, i) => (
              <li key={i} className="flex gap-3 py-2 items-start">
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                  e.tone === 'pos' ? 'bg-emerald-500' :
                  e.tone === 'neg' ? 'bg-rose-500' :
                  e.tone === 'warn' ? 'bg-amber-500' : 'bg-slate-400'
                }`} />
                <span className="text-[11.5px] text-slate-400 tabular shrink-0 w-12 mt-0.5 font-mono">{e.t}</span>
                <span className="text-[13px] text-slate-700 dark:text-slate-300 leading-snug">{e.text}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Active alerts"
          info={{
            what: 'Open operational alerts that haven\'t been acknowledged. Severity comes from the rule that filed them.',
            where: 'public.alerts WHERE acknowledged_at IS NULL.',
            fix: 'Click an alert to see the underlying issue. High-sev alerts also appear in the Issues page.',
          }}
          action={<Badge tone="rose" dot="bg-rose-500">{window.ALERTS.length} open</Badge>}
        >
          <ul className="space-y-2">
            {window.ALERTS.map((a, i) => (
              <li key={i} className="rounded-md border border-slate-200 dark:border-slate-800 p-2.5 hover:border-slate-300 dark:hover:border-slate-700 transition cursor-pointer">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    <Badge tone={a.sev === 'high' ? 'rose' : a.sev === 'med' ? 'amber' : 'slate'}>
                      {a.sev}
                    </Badge>
                    <span className="text-[11px] text-slate-400 tabular">{a.age}</span>
                  </div>
                </div>
                <div className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200 leading-tight">{a.title}</div>
                <div className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{a.body}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

window.OverviewPage = OverviewPage;
