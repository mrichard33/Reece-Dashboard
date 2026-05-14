// ============ APP SHELL ============

const NAV = [
  { id: 'overview',    label: 'Overview',             icon: 'LayoutDashboard', role: 'all' },
  { id: 'pipelines',   label: 'Pipelines',            icon: 'GitBranch',       role: 'all' },
  { id: 'workflows',   label: 'Workflows',            icon: 'Workflow',        role: 'all' },
  { id: 'diagnostics', label: 'Workflow Diagnostics', icon: 'Stethoscope',     role: 'operator' },
  { id: 'agents',      label: 'Agent Layer',          icon: 'Bot',             role: 'all' },
  { id: 'approvals',   label: 'Approval Queue',       icon: 'CheckSquare',     role: 'operator', badge: 3 },
  { id: 'leads',       label: 'Leads',                icon: 'Users',           role: 'all' },
  { id: 'appts',       label: 'Appointments',         icon: 'CalendarDays',    role: 'all' },
  { id: 'issues',      label: 'Issues',               icon: 'TriangleAlert',   role: 'operator', badge: 6, badgeTone: 'rose' },
  { id: 'opslog',      label: 'Ops Log',              icon: 'ScrollText',      role: 'operator' },
];

function Sidebar({ route, setRoute, collapsed, setCollapsed, role }) {
  const visible = NAV.filter(n => n.role === 'all' || (n.role === 'operator' && role === 'operator'));

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-60'} shrink-0 flex flex-col bg-[#0C2340] text-slate-200 transition-all duration-200 border-r border-black/30`}>
      {/* Brand */}
      <div className={`h-14 flex items-center ${collapsed ? 'justify-center px-0' : 'px-4'} border-b border-white/10`}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-brick flex items-center justify-center shrink-0">
            <Icon name="ShieldCheck" size={18} className="text-white" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-display font-bold text-[13px] text-white tracking-tight">REECE</div>
              <div className="text-[9.5px] tracking-[0.18em] uppercase text-slate-400 font-medium">Mission Control</div>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-2">
          {visible.map(n => {
            const active = route === n.id;
            return (
              <li key={n.id}>
                <button
                  onClick={() => setRoute(n.id)}
                  title={n.label}
                  className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-2.5'} py-2 rounded-md text-[12.5px] font-medium transition group relative ${
                    active
                      ? 'bg-white/10 text-white'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-brick"></span>}
                  <Icon name={n.icon} size={16} className={active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'} />
                  {!collapsed && <span className="truncate">{n.label}</span>}
                  {!collapsed && n.badge && (
                    <span className={`ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-semibold rounded-full px-1 tabular ${
                      n.badgeTone === 'rose' ? 'bg-rose-500/90 text-white' : 'bg-amber-500/90 text-white'
                    }`}>{n.badge}</span>
                  )}
                  {collapsed && n.badge && (
                    <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                      n.badgeTone === 'rose' ? 'bg-rose-500' : 'bg-amber-500'
                    }`} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {!collapsed && (
          <div className="mt-6 px-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 px-1">System</div>
            <div className="rounded-md bg-white/[0.04] border border-white/5 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <StatusDot status="warning" />
                <span className="text-[11.5px] font-semibold text-slate-200">1 service degraded</span>
              </div>
              <div className="text-[10.5px] text-slate-400 leading-snug">
                Decision Engine heartbeat at 11m. Watching.
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Collapse */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="h-10 border-t border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition"
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        <Icon name={collapsed ? 'ChevronRight' : 'ChevronLeft'} size={14} />
        {!collapsed && <span className="ml-1.5 text-[11px]">Collapse</span>}
      </button>
    </aside>
  );
}

function TopBar({ route, role, setRole, dark, setDark }) {
  const labelFor = (id) => NAV.find(n => n.id === id)?.label || 'Overview';

  return (
    <header className="h-14 shrink-0 flex items-center justify-between gap-4 px-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 text-[12px] text-slate-400">
          <span>Antifragile</span>
          <Icon name="ChevronRight" size={12} />
          <span className="text-slate-700 dark:text-slate-200 font-medium">{labelFor(route)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="hidden md:flex items-center gap-2 h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-[12px] text-slate-400 w-64">
          <Icon name="Search" size={13} />
          <span>Search contacts, workflows…</span>
          <span className="ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">⌘K</span>
        </div>

        {/* Role toggle */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-md p-0.5">
          {['operator','team'].map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`h-7 px-3 text-[11.5px] font-medium rounded transition capitalize ${
                role === r
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Dark toggle */}
        <button
          onClick={() => setDark(d => !d)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900"
          title={dark ? 'Switch to light' : 'Switch to dark'}
        >
          <Icon name={dark ? 'Sun' : 'Moon'} size={14} />
        </button>

        {/* Bell */}
        <button className="relative h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900">
          <Icon name="Bell" size={14} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
        </button>

        {/* Avatar */}
        <div className="flex items-center gap-2 pl-2 ml-1 border-l border-slate-200 dark:border-slate-800">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0C2340] to-[#1B3349] text-white flex items-center justify-center text-[11px] font-semibold">JW</div>
          <div className="hidden lg:block leading-tight">
            <div className="text-[12px] font-medium text-slate-800 dark:text-slate-100">Jess Walters</div>
            <div className="text-[10.5px] text-slate-500 capitalize">{role}</div>
          </div>
        </div>
      </div>
    </header>
  );
}

function App() {
  const [route, setRoute] = useState('overview');
  const [role, setRole] = useState('operator');
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // auto-collapse on narrower screens
  useEffect(() => {
    const onResize = () => setCollapsed(window.innerWidth < 1100);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // If team selected and route is operator-only, fall back to overview
  useEffect(() => {
    const nav = NAV.find(n => n.id === route);
    if (nav && nav.role === 'operator' && role !== 'operator') setRoute('overview');
  }, [role, route]);

  const PAGES = {
    overview:    OverviewPage,
    pipelines:   PipelinesPage,
    workflows:   WorkflowsPage,
    diagnostics: DiagnosticsPage,
    agents:      AgentLayerPage,
    approvals:   ApprovalsPage,
    leads:       LeadsPage,
    appts:       AppointmentsPage,
    issues:      IssuesPage,
    opslog:      OpsLogPage,
  };
  const Page = PAGES[route] || OverviewPage;

  return (
    <div className={dark ? 'dark' : ''} data-screen-label={`Reece Mission Control / ${route}`}>
      <div className="flex h-screen w-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
        <Sidebar route={route} setRoute={setRoute} collapsed={collapsed} setCollapsed={setCollapsed} role={role} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar route={route} role={role} setRole={setRole} dark={dark} setDark={setDark} />
          <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
            <div className="p-6 max-w-[1600px] mx-auto">
              <Page role={role} />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
