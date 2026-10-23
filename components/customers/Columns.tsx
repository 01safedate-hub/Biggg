export type ColSeries = { key: string; label: string; color: string };
export type ColRow = { label: string; values: Record<string, number> };

const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
};

/** Column chart. `stacked` stacks the series (a histogram of groups); otherwise they sit side by side. SVG only, no scripts. */
export function Columns({ rows, series, stacked = false, height = 240, empty = "Nothing to show yet." }: { rows: ColRow[]; series: ColSeries[]; stacked?: boolean; height?: number; empty?: string }) {
  const totals = rows.map((r) => series.reduce((s, x) => s + (r.values[x.key] ?? 0), 0));
  const maxVal = Math.max(0, ...rows.flatMap((r, i) => (stacked ? [totals[i]] : series.map((s) => r.values[s.key] ?? 0))));
  if (rows.length === 0 || maxVal === 0) return <p className="rounded-md bg-canvas p-6 text-center text-sm text-ink-mute">{empty}</p>;
  const max = niceMax(maxVal);
  const W = Math.max(320, rows.length * (stacked ? 44 : 22 + series.length * 14));
  const L = 34, T = 10, B = 44, H = height;
  const bw = (W - L) / rows.length;
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const every = rows.length > 16 ? Math.ceil(rows.length / 12) : 1;
  return (
    <div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W > 520 ? W : undefined }} className="w-full" role="img" aria-label={`Column chart. ${rows.map((r, i) => `${r.label}: ${series.map((s) => `${s.label} ${r.values[s.key] ?? 0}`).join(", ")}`).join(". ")}`}>
          {ticks.map((t) => (
            <g key={t}><line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} /><text x={L - 6} y={y(t) + 4} textAnchor="end" style={{ fontSize: 10 }} className="fill-slate-500">{t}</text></g>
          ))}
          {rows.map((r, i) => {
            const x0 = L + i * bw;
            let acc = 0;
            return (
              <g key={r.label + i}>
                {stacked
                  ? series.map((s) => { const v = r.values[s.key] ?? 0; if (!v) return null; const yy = y(acc + v); const h = y(acc) - yy; acc += v; return <rect key={s.key} x={x0 + bw * 0.18} y={yy} width={bw * 0.64} height={Math.max(1, h - 1)} fill={s.color} rx={2}><title>{`${r.label}: ${s.label} ${v}`}</title></rect>; })
                  : series.map((s, k) => { const v = r.values[s.key] ?? 0; const w = (bw * 0.8) / series.length; return <rect key={s.key} x={x0 + bw * 0.1 + k * w} y={y(v)} width={Math.max(2, w - 2)} height={Math.max(v ? 1 : 0, y(0) - y(v))} fill={s.color} rx={2}><title>{`${r.label}: ${s.label} ${v}`}</title></rect>; })}
                {i % every === 0 && <text x={x0 + bw / 2} y={H - B + 16} textAnchor="middle" style={{ fontSize: 10 }} className="fill-slate-500">{r.label}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-soft">{series.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</li>)}</ul>
    </div>
  );
}
