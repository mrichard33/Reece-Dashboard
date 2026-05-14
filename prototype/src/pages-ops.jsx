// ============ ISSUES + OPS LOG ============

function IssuesPage() {
  const sevTone = (s) => s === 'high' ? 'rose' : s === 'med' ? 'amber' : 'slate';

  const Tbl = ({ title, info, columns, rows, render, action }) => (
    <Card title={title} info={info} action={action}>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-slate-500 dark:text-slate-400">
              {columns.map(c => <th key={c} className="font-medium pb-2 pr-3">{c}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => render(r, i))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Issues"
        subtitle="Open issues, contamination violations, data drift, and stuck contacts."
        action={<Button variant="navy" size="sm" icon="Plus">File issue</Button>}
      />

      <Tbl
        title="Open issues"
        info={{
          what: 'All open operational issues across the system. Anything blocking end-of-day signoff.',
          where: 'public.issues WHERE resolved_at IS NULL.',
          fix: 'Sort by severity. High severity blocks deploys; med blocks pipeline reviews.',
        }}
        action={<Badge tone="rose">{window.ISSUES.open.length} open</Badge>}
        columns={['Severity', 'Issue', 'Opened', 'Owner']}
        rows={window.ISSUES.open}
        render={(r, i) => (
          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
            <td className="py-2 pr-3"><Badge tone={sevTone(r.sev)}>{r.sev}</Badge></td>
            <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">{r.title}</td>
            <td className="py-2 pr-3 text-slate-500 tabular">{r.opened}</td>
            <td className="py-2 pr-3 font-mono text-slate-500">{r.owner}</td>
          </tr>
        )}
      />

      <Tbl
        title="Contamination violations"
        info={{
          what: 'Workflows reaching contacts they shouldn\'t — wrong stage, wrong tag set, missed guard.',
          where: 'Nightly contamination scan over the last 7d of workflow_enters.',
          fix: 'The "fix" column has a concrete patch. Most are missing namespace guards.',
        }}
        columns={['Workflow', 'Violation', 'Recommended fix']}
        rows={window.ISSUES.contam}
        render={(r, i) => (
          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
            <td className="py-2 pr-3 font-mono text-slate-700 dark:text-slate-200">{r.code}</td>
            <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{r.viol}</td>
            <td className="py-2 pr-3 text-slate-500">{r.fix}</td>
          </tr>
        )}
      />

      <Tbl
        title="Namespace violations"
        info={{
          what: 'Contacts holding mutually-exclusive tags from the same namespace.',
          where: 'config.tag_namespaces enforcement.',
          fix: 'Most-recent tag wins. Auto-resolved nightly.',
        }}
        action={<Badge tone="amber">{window.ISSUES.namespace.length} contacts</Badge>}
        columns={['Contact', 'Conflicting tags']}
        rows={window.ISSUES.namespace}
        render={(r, i) => (
          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
            <td className="py-2 pr-3 font-mono text-slate-700 dark:text-slate-200">{r.contact}</td>
            <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{r.tags}</td>
          </tr>
        )}
      />

      <Tbl
        title="Drift candidates"
        info={{
          what: 'Contacts whose state in GHL and the lead platform have diverged — usually means a sync event was missed.',
          where: 'JOIN of ghl.contact_status and lp.contact_status with mismatch detection.',
          fix: 'GHL is source of truth. Trigger a manual reconcile from HL MCP for the contact.',
        }}
        columns={['Name', 'GHL state', 'LP state']}
        rows={window.ISSUES.drift}
        render={(r, i) => (
          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
            <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">{r.name}</td>
            <td className="py-2 pr-3 text-slate-700 dark:text-slate-300"><Badge tone="slate">{r.ghl}</Badge></td>
            <td className="py-2 pr-3 text-slate-700 dark:text-slate-300"><Badge tone="amber">{r.lp}</Badge></td>
          </tr>
        )}
      />

      <Tbl
        title="Stuck contacts"
        info={{
          what: 'Opportunities that have been in their current stage longer than the stage SLA allows.',
          where: 'public.opportunities WHERE now() − stage_entered_at > stage_sla.',
          fix: 'Hand off to a rep manually. If many contacts get stuck in the same stage, the exit rule for that stage is too tight.',
        }}
        action={<Badge tone="rose">{window.ISSUES.stuck.length} stuck</Badge>}
        columns={['Name', 'Stage', 'Days in stage', 'Last activity']}
        rows={window.ISSUES.stuck}
        render={(r, i) => (
          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
            <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">{r.name}</td>
            <td className="py-2 pr-3"><Badge tone="slate">{r.stage}</Badge></td>
            <td className="py-2 pr-3 tabular">
              <span className={`font-mono ${r.days > 30 ? 'text-rose-600 font-semibold' : r.days > 14 ? 'text-amber-600' : 'text-slate-600'}`}>{r.days}d</span>
            </td>
            <td className="py-2 pr-3 text-slate-500">{r.last}</td>
          </tr>
        )}
      />
    </div>
  );
}

// ============ OPS LOG ============

function ExpandableRow({ summary, detail }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer" onClick={() => setOpen(o => !o)}>
        {summary}
        <td className="py-2 pr-3 text-right">
          <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-slate-400" />
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50/60 dark:bg-slate-900/40">
          <td colSpan={99} className="py-3 px-4 text-[12px] text-slate-600 dark:text-slate-300 font-mono leading-relaxed">
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}

function OpsLogPage() {
  const [tab, setTab] = useState('events');
  const [priFilter, setPriFilter] = useState('All');

  const tabs = [
    { value: 'sessions', label: 'Session logs' },
    { value: 'decisions', label: 'Decision log' },
    { value: 'events', label: 'System events' },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Ops Log"
        subtitle="Raw operational logs. Pagination + filters."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" icon="Download">Export</Button>
            <Button variant="outline" size="sm" icon="Search">Search</Button>
          </div>
        }
      />

      <div className="flex items-center justify-between">
        <TabRow tabs={tabs} value={tab} onChange={setTab} />
        {tab === 'events' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 mr-1">Priority:</span>
            <TabRow tabs={['All','high','med','low']} value={priFilter} onChange={setPriFilter} />
          </div>
        )}
      </div>

      <Card dense>
        <div className="overflow-x-auto -mx-3 px-3">
          {tab === 'sessions' && (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th className="font-medium pb-2 pr-3">ID</th>
                  <th className="font-medium pb-2 pr-3">User</th>
                  <th className="font-medium pb-2 pr-3">Start</th>
                  <th className="font-medium pb-2 pr-3">Duration</th>
                  <th className="font-medium pb-2 pr-3">Actions</th>
                  <th className="font-medium pb-2 pr-3">Outcome</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {window.SESSION_LOGS.map(r => (
                  <ExpandableRow key={r.id} detail={r.detail} summary={<>
                    <td className="py-2 pr-3 font-mono text-slate-700 dark:text-slate-200">{r.id}</td>
                    <td className="py-2 pr-3 font-mono text-slate-500">{r.who}</td>
                    <td className="py-2 pr-3 font-mono tabular text-slate-500">{r.start}</td>
                    <td className="py-2 pr-3 tabular text-slate-700 dark:text-slate-300">{r.dur}</td>
                    <td className="py-2 pr-3 tabular text-slate-700 dark:text-slate-300">{r.actions}</td>
                    <td className="py-2 pr-3"><Badge tone={r.outcome === 'normal' ? 'slate' : r.outcome === 'rule edited' ? 'amber' : 'emerald'}>{r.outcome}</Badge></td>
                  </>} />
                ))}
              </tbody>
            </table>
          )}
          {tab === 'decisions' && (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th className="font-medium pb-2 pr-3">ID</th>
                  <th className="font-medium pb-2 pr-3">Rule</th>
                  <th className="font-medium pb-2 pr-3">Contact</th>
                  <th className="font-medium pb-2 pr-3">Confidence</th>
                  <th className="font-medium pb-2 pr-3">Decision</th>
                  <th className="font-medium pb-2 pr-3">When</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {window.DECISION_LOGS.map(r => (
                  <ExpandableRow key={r.id} detail={r.detail} summary={<>
                    <td className="py-2 pr-3 font-mono text-slate-700 dark:text-slate-200">{r.id}</td>
                    <td className="py-2 pr-3 font-mono text-slate-700 dark:text-slate-300">{r.rule}</td>
                    <td className="py-2 pr-3 font-mono text-slate-500">{r.contact}</td>
                    <td className="py-2 pr-3 tabular text-slate-700 dark:text-slate-300">{r.confidence}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={r.decision.startsWith('auto-exec') ? 'emerald' : r.decision === 'queued for approval' ? 'amber' : r.decision === 'auto-rejected' ? 'rose' : 'slate'}>
                        {r.decision}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 font-mono tabular text-slate-500">{r.when}</td>
                  </>} />
                ))}
              </tbody>
            </table>
          )}
          {tab === 'events' && (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th className="font-medium pb-2 pr-3">ID</th>
                  <th className="font-medium pb-2 pr-3">Priority</th>
                  <th className="font-medium pb-2 pr-3">Source</th>
                  <th className="font-medium pb-2 pr-3">Message</th>
                  <th className="font-medium pb-2 pr-3">When</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {window.SYSTEM_EVENTS
                  .filter(r => priFilter === 'All' || r.pri === priFilter)
                  .map(r => (
                  <ExpandableRow key={r.id}
                    detail={`Raw event payload (truncated): { "id": "${r.id}", "src": "${r.src}", "msg": "${r.msg}", "ts": "2026-05-14T${r.when}:00-04:00", "trace_id": "0x${Math.random().toString(16).slice(2,10)}" }`}
                    summary={<>
                      <td className="py-2 pr-3 font-mono text-slate-700 dark:text-slate-200">{r.id}</td>
                      <td className="py-2 pr-3"><Badge tone={r.pri === 'high' ? 'rose' : r.pri === 'med' ? 'amber' : 'slate'}>{r.pri}</Badge></td>
                      <td className="py-2 pr-3 font-mono text-slate-500">{r.src}</td>
                      <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{r.msg}</td>
                      <td className="py-2 pr-3 font-mono tabular text-slate-500">{r.when}</td>
                    </>} />
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="text-[11.5px] text-slate-500 tabular">Showing 1–15 of 2,418</div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" icon="ChevronLeft">Prev</Button>
            <Button variant="outline" size="sm">Next →</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

window.IssuesPage = IssuesPage;
window.OpsLogPage = OpsLogPage;
