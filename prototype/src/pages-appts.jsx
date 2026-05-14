// ============ APPOINTMENTS PAGE ============

function ApptCard({ a }) {
  const statusTone = {
    confirmed: 'emerald',
    'in-progress': 'navy',
    pending: 'amber',
    tentative: 'slate',
  };
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3.5 hover:border-slate-300 dark:hover:border-slate-700 transition">
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="font-mono text-[14px] font-semibold text-slate-900 dark:text-slate-100 tabular">{a.time}</div>
        <Badge tone={statusTone[a.status] || 'slate'} dot={a.status === 'in-progress' ? 'bg-blue-500' : null}>{a.status}</Badge>
      </div>
      <div className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">{a.name}</div>
      <div className="text-[11.5px] text-slate-500 mt-0.5 flex items-center gap-1">
        <Icon name="UserRound" size={11} />
        {a.rep}
      </div>
      <div className="text-[11.5px] text-slate-500 mt-1 flex items-start gap-1">
        <Icon name="MapPin" size={11} className="mt-0.5 shrink-0" />
        <span className="truncate">{a.addr}</span>
      </div>
    </div>
  );
}

function ApptsTodayTab() {
  return (
    <div className="space-y-5">
      {window.APPT_GROUPS.map(g => (
        <div key={g.type}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {g.type}
              <span className="ml-2 text-slate-400 font-normal tracking-normal">{g.items.length}</span>
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {g.items.map((a, i) => <ApptCard key={i} a={a} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ApptsCancellationsTab() {
  const Section = ({ bucket, title, tone, info }) => (
    <Card title={title} info={info} action={<Badge tone={tone}>{bucket.length}</Badge>}>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {bucket.map((c, i) => (
          <li key={i} className="py-2.5">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">{c.name}</span>
              <span className="text-[11px] text-slate-400 tabular">{c.when}</span>
            </div>
            <div className="text-[12px] text-slate-500 leading-snug">{c.reason}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Section
        bucket={window.CANCELLATIONS.engaged}
        title="ENGAGED — will reactivate"
        tone="emerald"
        info={{
          what: 'Cancellations from engaged contacts. They\'re still warm — the rescue workflow S5.2 will rebook them.',
          where: 'public.appointments WHERE cancelled_at IS NOT NULL AND contact.tag contains stage:engaged.',
          fix: 'If S5.2 isn\'t firing, check Workflows tab. Most reschedules happen within 72h.',
        }}
      />
      <Section
        bucket={window.CANCELLATIONS.cold}
        title="COLD — re-engagement candidates"
        tone="slate"
        info={{
          what: 'Cancellations from contacts that have gone cold. They drop into the 90-day re-engagement loop (S1.1).',
          where: 'public.appointments WHERE cancelled AND contact dormancy > 14d.',
          fix: 'Don\'t manually re-touch these — let S1.1 do its thing. Manual contact resets the cooldown.',
        }}
      />
    </div>
  );
}

function ApptsEmptyTab({ label, info }) {
  return (
    <Card title={label} info={info}>
      <Empty
        icon="CalendarClock"
        title={`No ${label.toLowerCase()} yet`}
        body="The schedule for this view is still being assembled. Check back after the morning sync."
        tone="slate"
      />
    </Card>
  );
}

function AppointmentsPage() {
  const [tab, setTab] = useState('today');
  const tabs = [
    { value: 'today',         label: 'Today',         count: 8 },
    { value: 'tomorrow',      label: 'Tomorrow',      count: 11 },
    { value: 'week',          label: 'This Week',     count: 47 },
    { value: 'cancellations', label: 'Cancellations', count: window.CANCELLATIONS.engaged.length + window.CANCELLATIONS.cold.length },
    { value: 'no-shows',      label: 'No-shows',      count: 4 },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Appointments"
        subtitle="Today's schedule across all reps and appointment types."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon="Calendar">Calendar view</Button>
            <Button variant="navy" size="sm" icon="Plus">Book</Button>
          </div>
        }
      />

      <TabRow tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'today' && <ApptsTodayTab />}
      {tab === 'cancellations' && <ApptsCancellationsTab />}
      {tab === 'tomorrow' && <ApptsEmptyTab label="Tomorrow's schedule" info={{
        what: 'Booked appointments for tomorrow across all reps.',
        where: 'GHL calendar API, 24h window.',
        fix: 'If this is empty Mon–Fri after 5pm, the calendar sync stalled — check HL MCP.',
      }} />}
      {tab === 'week' && <ApptsEmptyTab label="This week's schedule" info={{
        what: '7-day rolling appointment view, all types.',
        where: 'GHL calendar API.',
        fix: 'Check reps with empty days — usually missing slot availability config.',
      }} />}
      {tab === 'no-shows' && <ApptsEmptyTab label="Recent no-shows" info={{
        what: 'Booked appointments where the contact did not show, in the last 14 days.',
        where: 'public.appointments WHERE actual_started_at IS NULL AND scheduled_for < now().',
        fix: 'Most no-shows are recoverable via S5.2. If S5.2 has a >25% recovery rate, leave it alone.',
      }} />}
    </div>
  );
}

window.AppointmentsPage = AppointmentsPage;
