export type Slice = { label: string; value: number; color: string; href?: string };

/** Pie/donut with the total in the middle and every value written out beside it, so colour is never the only cue. */
export function Donut({ slices, centre, caption }: { slices: Slice[]; centre: string; caption: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 70, r = 46, cx = 90, cy = 90;
  let a0 = -Math.PI / 2;
  const arcs = slices.filter((s) => s.value > 0).map((s) => {
    const frac = s.value / total;
    const a1 = a0 + (frac >= 0.9999 ? Math.PI * 2 - 0.0001 : frac * Math.PI * 2);
    const p = (rad: number, a: number) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
    a0 = a1;
    return { d, color: s.color, label: s.label };
  });
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0" role="img" aria-label={`${caption}: ${slices.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
        {total === 0 ? <circle cx={cx} cy={cy} r={(R + r) / 2} fill="none" stroke="#e2e8f0" strokeWidth={R - r} /> : arcs.map((a) => <path key={a.label} d={a.d} fill={a.color} stroke="#fff" strokeWidth={2} />)}
        <text x={cx} y={cy - 2} textAnchor="middle" className="fill-slate-900" style={{ fontSize: 26, fontWeight: 800 }}>{centre}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>{caption}</text>
      </svg>
      <ul className="min-w-[14rem] flex-1 space-y-2 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />{s.href ? <a href={s.href} className="hover:underline">{s.label}</a> : s.label}</span>
            <span className="font-semibold tabular-nums">{s.value} <span className="font-normal text-ink-mute">({total ? Math.round((s.value / total) * 100) : 0}%)</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
