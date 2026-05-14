// ============ PIPELINES PAGE ============

function StageBar({ stages, total }) {
  const agingColor = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose:  'bg-rose-500',
  };
  return (
    <div>
      <div className="flex w-full h-9 rounded-md overflow-hidden border border-slate-200 dark:border-slate-800">
        {stages.map((s, i) => {
          const pct = (s.n / total) * 100;
          return (
            <div
              key={i}
              className={`relative ${agingColor[s.aging]} hover:brightness-110 transition group`}
              style={{ width: `${pct}%` }}
              title={`${s.name} — ${s.n} opps (${s.aging === 'green' ? '<7d' : s.aging === 'amber' ? '7-14d' : '>14d'} aging)`}
            >
              {pct > 5 && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-semibold tabular px-1">
                  {s.n}
                </div>
              )}
              {/* tooltip on hover */}
              <div className="absolute z-10 bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] rounded-md px-2 py-1.5 whitespace-nowrap shadow-lg pointer-events-none">
                <div className="font-semibold">{s.name}</div>
                <div className="text-[10px] opacity-80 tabular">{s.n} opps · {s.aging === 'green' ? '<7d' : s.aging === 'amber' ? '7–14d' : '>14d'}</div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Stage names below */}
      <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map((s, i) => (
          <div key={i} className="text-[10px] font-medium text-slate-500 dark:text-slate-400 text-center leading-tight truncate" title={s.name}>
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelinesPage({ role }) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Pipelines"
        subtitle="Stage distributions across all three pipelines. Color = aging in stage."
        action={
          <div className="flex items-center gap-3 text-[11.5px]">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> <span className="text-slate-500">&lt; 7d</span></span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />   <span className="text-slate-500">7–14d</span></span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />    <span className="text-slate-500">&gt; 14d</span></span>
          </div>
        }
      />

      <div className="space-y-4">
        {window.PIPELINES.map(p => (
          <Card
            key={p.id}
            title={
              <span className="flex items-center gap-2">
                <Badge tone="navy" className="font-mono">{p.id}</Badge>
                <span>{p.name}</span>
              </span>
            }
            info={p.info}
            action={
              <div className="flex items-center gap-4">
                <div className="text-[12px] text-slate-500 tabular">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 tabular">{num(p.count)}</span> opps
                </div>
                <div className="text-[12px] text-slate-500 tabular">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 tabular">{money(p.value)}</span> total
                </div>
                <Button variant="outline" size="sm" icon="RefreshCw">Sync now</Button>
              </div>
            }
          >
            <div className="mt-1">
              <StageBar stages={p.stages} total={p.count} />
            </div>
            <div className="mt-4 flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-4 text-slate-500">
                <span>Avg cycle <span className="tabular text-slate-700 dark:text-slate-300 font-semibold">{p.id === 'P1' ? '38d' : p.id === 'P2' ? '21d' : '94d'}</span></span>
                <span>Stuck (&gt;14d) <span className="tabular text-rose-600 font-semibold">{p.stages.filter(s => s.aging === 'rose').reduce((a, s) => a + s.n, 0)}</span></span>
                <span>Last advance <span className="tabular text-slate-700 dark:text-slate-300">11:12</span></span>
              </div>
              <button className="text-[12px] font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 flex items-center gap-1">
                Open detail <Icon name="ArrowRight" size={12} />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

window.PipelinesPage = PipelinesPage;
