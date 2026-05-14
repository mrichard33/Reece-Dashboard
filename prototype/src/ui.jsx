// ============ SHARED UI ============
const { useState, useEffect, useRef, useMemo } = React;

// -------- InfoPopover --------
function InfoPopover({ info }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <span className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        aria-label="More info"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition"
        title="What is this?"
      >
        <Icon name="Info" size={14} />
      </button>
      {open && (
        <div className="absolute z-30 left-5 top-0 w-80 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3 text-[12.5px] leading-relaxed">
          <div className="space-y-2.5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">What this shows</div>
              <div className="text-slate-800 dark:text-slate-200">{info.what}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Where the data comes from</div>
              <div className="text-slate-700 dark:text-slate-300 font-mono text-[11.5px]">{info.where}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">If it looks wrong</div>
              <div className="text-slate-800 dark:text-slate-200">{info.fix}</div>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

// -------- Card --------
function Card({ title, info, action, children, className = '', dense = false }) {
  return (
    <div className={`rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between gap-3 ${dense ? 'px-3 pt-3 pb-2' : 'px-4 pt-4 pb-2'}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 truncate">{title}</h3>
            {info && <InfoPopover info={info} />}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={dense ? 'px-3 pb-3' : 'px-4 pb-4'}>{children}</div>
    </div>
  );
}

// -------- StatusDot --------
function StatusDot({ status }) {
  const map = {
    healthy: 'bg-emerald-500 shadow-emerald-500/40',
    warning: 'bg-amber-500 shadow-amber-500/40',
    critical: 'bg-rose-500 shadow-rose-500/40',
    neutral: 'bg-slate-400 shadow-slate-400/40',
  };
  return (
    <span className={`relative inline-flex items-center justify-center w-2.5 h-2.5`}>
      <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${map[status]}`}></span>
      <span className={`relative inline-flex rounded-full h-2 w-2 ${map[status]}`}></span>
    </span>
  );
}

// -------- Badge --------
function Badge({ tone = 'slate', children, dot, className = '' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
    amber:   'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30',
    rose:    'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30',
    slate:   'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600/40',
    navy:    'bg-[#0C2340] text-white ring-transparent',
    brick:   'bg-brick text-white ring-transparent',
    cream:   'bg-[#FAF0C9] text-[#0C2340] ring-amber-300/40',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${tones[tone]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      {children}
    </span>
  );
}

// -------- StatTile --------
function StatTile({ label, value, delta, deltaTone, info, accent, suffix, loading }) {
  const tones = {
    pos: 'text-emerald-600 dark:text-emerald-400',
    neg: 'text-rose-600 dark:text-rose-400',
    warn: 'text-amber-600 dark:text-amber-400',
    mute: 'text-slate-500',
  };
  return (
    <div className={`rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 relative`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11.5px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{label}</span>
          {info && <InfoPopover info={info} />}
        </div>
        {accent}
      </div>
      <div className="flex items-baseline gap-2">
        {loading ? (
          <div className="h-9 w-20 rounded shimmer" />
        ) : (
          <div className={`text-3xl font-semibold tabular ${suffix === '!' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>{value}</div>
        )}
        {suffix && suffix !== '!' && <div className="text-base text-slate-400">{suffix}</div>}
      </div>
      {delta && <div className={`mt-1 text-[12px] font-medium tabular ${tones[deltaTone] || 'text-slate-500'}`}>{delta}</div>}
    </div>
  );
}

// -------- ServiceTile --------
function ServiceTile({ tile }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusDot status={tile.status} />
          <span className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 truncate">{tile.name}</span>
          {tile.info && <InfoPopover info={tile.info} />}
        </div>
        <Badge tone={tile.status === 'healthy' ? 'emerald' : tile.status === 'warning' ? 'amber' : 'rose'}>{tile.label}</Badge>
      </div>
      <div className="mt-2 text-[11.5px] font-mono text-slate-500 dark:text-slate-400">{tile.meta}</div>
    </div>
  );
}

// -------- SectionHeader --------
function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-end justify-between mb-4 gap-4">
      <div>
        <h1 className="font-display text-[22px] font-bold text-slate-900 dark:text-slate-50 tracking-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// -------- Button --------
function Button({ variant = 'default', size = 'sm', icon, children, onClick, className = '' }) {
  const sizes = { sm: 'h-8 px-3 text-[12px]', md: 'h-9 px-4 text-[13px]', icon: 'h-8 w-8' };
  const variants = {
    default: 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white',
    outline: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-900',
    ghost:   'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
    emerald: 'bg-emerald-600 text-white hover:bg-emerald-700',
    brick:   'bg-brick text-white hover:bg-brick-dark',
    navy:    'bg-[#0C2340] text-white hover:bg-[#122739]',
  };
  return (
    <button onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition ${sizes[size]} ${variants[variant]} ${className}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

// -------- TabRow --------
function TabRow({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {tabs.map(t => (
        <button
          key={t.value || t}
          onClick={() => onChange(t.value || t)}
          className={`h-8 px-3 text-[12px] font-medium rounded-md transition ${
            (t.value || t) === value
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {t.label || t}
          {t.count != null && <span className="ml-1.5 text-[10.5px] opacity-70 tabular">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// -------- Empty --------
function Empty({ icon = 'CircleCheck', title, body, tone = 'emerald' }) {
  const tones = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    slate: 'text-slate-400',
  };
  return (
    <div className="flex flex-col items-center justify-center text-center py-6">
      <Icon name={icon} size={28} className={tones[tone]} />
      <div className="mt-2 text-[13px] font-semibold text-slate-700 dark:text-slate-200">{title}</div>
      {body && <div className="text-[12px] text-slate-500 mt-0.5 max-w-xs">{body}</div>}
    </div>
  );
}

// -------- Money --------
function money(v) {
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${Math.round(v/1e3)}K`;
  return `$${v}`;
}
function num(v) { return v.toLocaleString(); }

Object.assign(window, {
  InfoPopover, Card, StatusDot, Badge, StatTile, ServiceTile, SectionHeader,
  Button, TabRow, Empty, money, num,
});
