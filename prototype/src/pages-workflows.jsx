// ============ WORKFLOWS + DIAGNOSTICS ============

function WorkflowsPage({ role }) {
  const [filter, setFilter] = useState('All');
  const [family, setFamily] = useState('All');

  const filtered = window.WORKFLOWS.filter(w => {
    if (filter !== 'All' && w.status !== filter) return false;
    if (family !== 'All') {
      const famPrefix = family.replace('.x', '');
      if (!w.code.startsWith(famPrefix)) return false;
    }
    return true;
  });

  const statusTone = (s) => s === 'Published' ? 'emerald' : s === 'Draft' ? 'amber' : 'rose';
  const badgeTone = (b) => b === 'dead' ? 'rose' : b === 'duplicate trigger' ? 'amber' : b === 'wait bottleneck' ? 'amber' : 'slate';

  const tiles = [
    { label: 'Total',           value: window.WORKFLOW_STATS.total },
    { label: 'Published',       value: window.WORKFLOW_STATS.published, tone: 'pos' },
    { label: 'Draft',           value: window.WORKFLOW_STATS.draft,     tone: 'warn' },
    { label: 'Dead',            value: window.WORKFLOW_STATS.dead,      tone: 'neg' },
    { label: 'With duplicates', value: window.WORKFLOW_STATS.duplicates, tone: 'warn' },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Workflows"
        subtitle="Canonical workflow registry. Diagnostics flag bad shapes (dead, duplicate triggers, message overlap)."
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {tiles.map(t => (
          <StatTile key={t.label} label={t.label} value={t.value} deltaTone={t.tone} />
        ))}
      </div>

      <Card
        title="Workflow registry"
        info={{
          what: 'Every workflow we publish to GHL — canonical code, current status, last modification, and any diagnostic badges from nightly runs.',
          where: 'public.workflows joined to public.workflow_diagnostics. Codes follow the E/S/L/O/A/B/C/F family taxonomy.',
          fix: 'A "dead" workflow has had zero enters in 30 days — either retire it or wire its trigger back up. "wait bottleneck" means contacts are piling up in a single wait step.',
        }}
        action={
          <div className="flex items-center gap-2">
            <select
              value={family}
              onChange={e => setFamily(e.target.value)}
              className="h-8 text-[12px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-slate-700 dark:text-slate-200"
            >
              <option>All</option>
              {window.WORKFLOW_FAMILIES.map(f => <option key={f}>{f}</option>)}
            </select>
            <TabRow
              tabs={['All','Published','Draft','Dead']}
              value={filter}
              onChange={setFilter}
            />
          </div>
        }
      >
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400">
                <th className="font-medium pb-2 pr-3">Code</th>
                <th className="font-medium pb-2 pr-3">Name</th>
                <th className="font-medium pb-2 pr-3">Status</th>
                <th className="font-medium pb-2 pr-3">Last modified</th>
                <th className="font-medium pb-2 pr-3">Health</th>
                <th className="font-medium pb-2 pr-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(w => (
                <tr key={w.code} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition">
                  <td className="py-2 pr-3 font-mono text-slate-700 dark:text-slate-200">{w.code}</td>
                  <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">{w.name}</td>
                  <td className="py-2 pr-3"><Badge tone={statusTone(w.status)}>{w.status}</Badge></td>
                  <td className="py-2 pr-3 text-slate-500 tabular">{w.mod}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {w.badges.length === 0
                        ? <span className="text-slate-400 text-[11px]">—</span>
                        : w.badges.map((b, i) => <Badge key={i} tone={badgeTone(b)}>{b}</Badge>)}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <button className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                      <Icon name="EllipsisVertical" size={14} />
                    </button>
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

// ============ DIAGNOSTICS ============

function DiagCard({ title, info, last, rows, columns, empty }) {
  return (
    <Card
      title={title}
      info={info}
      action={
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 tabular font-mono">Last run {last}</span>
          <Button variant="outline" size="sm" icon="RefreshCw">Re-run</Button>
        </div>
      }
    >
      {rows.length === 0 ? (
        empty
      ) : (
        <div className="overflow-x-auto -mx-3 px-3">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400">
                {columns.map(c => <th key={c} className="font-medium pb-2 pr-3">{c}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r, i) => (
                <tr key={i}>
                  {Object.values(r).map((v, j) => (
                    <td key={j} className={`py-1.5 pr-3 ${j === 0 ? 'font-mono text-slate-700 dark:text-slate-200' : 'text-slate-700 dark:text-slate-300'}`}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function DiagnosticsPage() {
  const d = window.DIAG;
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Workflow Diagnostics"
        subtitle="Nightly + on-demand checks across all workflows."
        action={<Button variant="navy" size="sm" icon="Play">Run all</Button>}
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DiagCard
          title="Dead workflows"
          info={{
            what: 'Workflows with zero enter events in the last 30 days — they exist but nothing is using them.',
            where: 'public.workflow_enters aggregated by workflow_id over 30d window.',
            fix: 'Either retire the workflow (set status=Dead) or wire a trigger back up. Each row links to its trigger config.',
          }}
          last={d.dead.last}
          columns={['Code', 'Name', 'Reason']}
          rows={d.dead.rows.map(r => ({ code: r.code, name: r.name, reason: r.reason }))}
        />
        <DiagCard
          title="Duplicate triggers"
          info={{
            what: 'Two or more workflows firing off the same trigger event. Causes message overlap and rule contention.',
            where: 'Cross-product of workflow_triggers grouped by event signature.',
            fix: 'Decide which workflow owns the event. Add a "stop on conflict" guard to the one(s) you keep.',
          }}
          last={d.duplicates.last}
          columns={['Code', 'Trigger', 'Conflicts with']}
          rows={d.duplicates.rows.map(r => ({ code: r.code, trigger: r.trigger, conflict: r.conflict }))}
        />
        <DiagCard
          title="Message overlap"
          info={{
            what: 'Two workflows sending near-identical messages to the same contact within 48h.',
            where: 'Levenshtein distance over rendered SMS/email bodies within 48h window per contact.',
            fix: 'Most overlaps are deprecated v1/v2 workflows still active. Retire the older one.',
          }}
          last={d.overlap.last}
          columns={['Code', 'Overlap']}
          rows={d.overlap.rows.map(r => ({ code: r.code, overlap: r.overlap }))}
        />
        <DiagCard
          title="Wait bottlenecks"
          info={{
            what: 'Wait steps holding contacts longer than the configured max. Often a sign of a misconfigured exit condition.',
            where: 'public.workflow_wait_state filtered to time_in_wait > threshold.',
            fix: 'Open the workflow, check the exit conditions on the flagged wait step. Most bottlenecks are missing exit tags.',
          }}
          last={d.waits.last}
          columns={['Code', 'Wait step', 'Stuck', 'Avg wait']}
          rows={d.waits.rows.map(r => ({ code: r.code, step: r.step, stuck: r.stuck, avg: r.avg }))}
        />
        <DiagCard
          title="Circular automations"
          info={{
            what: 'Detects contacts re-entering a workflow they just exited within 24h — usually means rule A undoes what rule B just did.',
            where: 'Graph traversal over workflow_transitions, looking for cycles within 24h.',
            fix: 'Find the contradicting rules. Add a "cooldown" tag that excludes the contact from re-entry for N days.',
          }}
          last={d.circular.last}
          columns={[]}
          rows={[]}
          empty={<Empty icon="CircleCheck" title="All clear" body="No circular automations detected in the last run." tone="emerald" />}
        />
        <DiagCard
          title="Namespace violations"
          info={{
            what: 'Contacts holding two tags from the same exclusive namespace (e.g. stage:engaged and stage:cold).',
            where: 'Tag namespace config in config.tag_namespaces enforced against public.contact_tags.',
            fix: 'Auto-fix runs nightly but you can also resolve manually. The most-recently-applied tag wins by default.',
          }}
          last={d.namespace.last}
          columns={['Contact', 'Conflicting tags']}
          rows={d.namespace.rows.slice(0, 12).map(r => ({ contact: r.contact, tags: r.tags }))}
        />
      </div>
    </div>
  );
}

window.WorkflowsPage = WorkflowsPage;
window.DiagnosticsPage = DiagnosticsPage;
