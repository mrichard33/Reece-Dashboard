// ============ AGENT LAYER + APPROVALS ============

function AgentLayerPage() {
  const t = window.AGENT_TILES;
  const {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
  } = window.Recharts;

  const tiles = [
    { label: 'Active rules',     value: t.active },
    { label: 'Inactive',         value: t.inactive,  deltaTone: 'mute' },
    { label: 'Actions queued',   value: t.queued,    deltaTone: 'warn' },
    { label: 'Executed (24h)',   value: num(t.exec24) },
    { label: 'Failed (24h)',     value: t.failed,    deltaTone: 'neg', suffix: t.failed > 0 ? '!' : undefined },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Agent Layer"
        subtitle="Rules engine status, action throughput, and recent firings."
        action={
          <div className="flex items-center gap-2 text-[12px] text-slate-500">
            <StatusDot status="healthy" />
            <span>Heartbeat <span className="tabular text-slate-700 dark:text-slate-300 font-medium">{t.heartbeat}</span></span>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {tiles.map(tile => (
          <StatTile key={tile.label} {...tile} />
        ))}
        <StatTile label="Heartbeat" value={t.heartbeat} deltaTone="pos" delta="within SLA" />
      </div>

      <Card
        title="Actions per hour (24h)"
        info={{
          what: 'Throughput of the agent layer over the last 24 hours, split between successful executions and failures.',
          where: 'public.agent_executions bucketed by hour, joined to outcome status.',
          fix: 'A flat fail line means good. Spikes usually correlate with Twilio rate limits or a contact en-masse export. Cross-check with Ops Log → system events.',
        }}
      >
        <div className="h-72 -ml-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={window.AGENT_SERIES} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="2 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: 'rgb(100,116,139)', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={{ fill: 'rgb(100,116,139)', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                contentStyle={{ background: 'rgba(15,23,42,0.95)', border: 'none', borderRadius: 8, fontSize: 12, color: '#fff' }}
                labelStyle={{ color: '#94a3b8', fontFamily: 'JetBrains Mono', fontSize: 11 }}
                cursor={{ stroke: 'rgba(148,163,184,0.3)' }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
              <Line type="monotone" dataKey="success" name="Success" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="fail"    name="Fail"    stroke="#f43f5e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card
        title="Recent rule firings"
        info={{
          what: 'Every time a rule evaluates true and either auto-executes or queues for approval.',
          where: 'public.rule_firings, last 60 minutes by default.',
          fix: 'A rule firing at high rate (>50/min) is usually misconfigured — check the rule definition in Agent Layer config.',
        }}
        action={<Button variant="ghost" size="sm" icon="Filter">All rules</Button>}
      >
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {window.RULE_FIRINGS.map((r, i) => (
            <li key={i} className="grid grid-cols-12 gap-3 py-2 items-center text-[12.5px]">
              <span className="col-span-4 font-mono text-slate-800 dark:text-slate-200 truncate">{r.rule}</span>
              <span className="col-span-2 font-mono text-slate-500 truncate">{r.contact}</span>
              <span className="col-span-2 text-slate-400 tabular text-[11.5px]">{r.ago}</span>
              <span className="col-span-4 text-slate-600 dark:text-slate-300 truncate">
                <span className="text-slate-400">Action: </span>
                <span className="font-mono">{r.action}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ============ APPROVALS ============
function ApprovalCard({ a }) {
  const typeTone = a.type === 'move_opportunity' ? 'amber' : a.type === 'send_message' ? 'navy' : 'emerald';
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 hover:border-slate-300 dark:hover:border-slate-700 transition">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Badge tone={typeTone} className="font-mono">{a.type}</Badge>
          <span className="text-[11px] text-slate-400 tabular">{a.id} · queued {a.age}</span>
        </div>
        <Badge tone="slate">confidence {a.confidence}</Badge>
      </div>

      <div className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mb-3 leading-snug">{a.title}</div>

      <div className="rounded-md bg-slate-50 dark:bg-slate-900/60 px-3 py-2.5 mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[13px] font-medium text-slate-800 dark:text-slate-200">{a.contact.name}</span>
          <span className="text-[11px] font-mono text-slate-500">{a.contact.id}</span>
        </div>
        <div className="text-[11.5px] text-slate-500 mb-2">{a.contact.phone} · {a.contact.source} · {a.contact.city}</div>
        <div className="flex flex-wrap gap-1 mb-2">
          {a.contact.tags.map(t => <Badge key={t} tone="slate">{t}</Badge>)}
        </div>
        <div className="text-[12px] text-slate-600 dark:text-slate-300 leading-snug">{a.activity}</div>
      </div>

      <div className="text-[11.5px] text-slate-500 mb-3 flex items-center gap-2">
        <Icon name="Zap" size={12} className="text-amber-500" />
        Triggered by <span className="font-mono text-slate-700 dark:text-slate-200">{a.rule}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="emerald" size="md" icon="Check" className="flex-1">Approve</Button>
        <Button variant="outline" size="md" icon="X" className="flex-1">Reject</Button>
        <Button variant="ghost" size="md" icon="Pencil">Edit</Button>
      </div>
    </div>
  );
}

function ApprovalsPage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Approval Queue"
        subtitle="Decisions the agent layer surfaced for human review before executing."
        action={
          <div className="flex items-center gap-3">
            <Badge tone="rose" dot="bg-rose-500">{window.APPROVALS_PENDING.length} pending</Badge>
            <Button variant="outline" size="sm" icon="Settings">Threshold settings</Button>
          </div>
        }
      />

      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">Pending</h2>
          <InfoPopover info={{
            what: 'Actions waiting for a human to approve or reject. Each one is a decision the agent layer made but flagged as below its auto-execute threshold.',
            where: 'public.approval_queue WHERE state = ‘pending’, ordered by created_at asc.',
            fix: 'Oldest first. If you reject, note why — it tunes the confidence model.',
          }} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {window.APPROVALS_PENDING.map(a => <ApprovalCard key={a.id} a={a} />)}
        </div>
      </div>

      <Card
        title="Recent decisions"
        info={{
          what: 'The last 10 approval decisions and who made them — for audit and to spot patterns.',
          where: 'public.approval_queue WHERE state IN (‘approved’,‘rejected’) ORDER BY decided_at DESC.',
          fix: 'A long string of rejects on the same rule means the confidence threshold for that rule is too low.',
        }}
      >
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {window.APPROVALS_HISTORY.map((h, i) => (
            <li key={i} className="grid grid-cols-12 gap-3 py-2 items-center text-[12.5px]">
              <span className="col-span-1">
                <Badge tone={h.decision === 'approve' ? 'emerald' : 'rose'}>
                  {h.decision}
                </Badge>
              </span>
              <span className="col-span-7 text-slate-700 dark:text-slate-300 truncate"><span className="font-mono">{h.what}</span></span>
              <span className="col-span-2 text-slate-500 font-mono text-[11.5px] truncate">{h.who}</span>
              <span className="col-span-2 text-slate-400 tabular text-[11.5px] text-right">{h.when}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

window.AgentLayerPage = AgentLayerPage;
window.ApprovalsPage = ApprovalsPage;
