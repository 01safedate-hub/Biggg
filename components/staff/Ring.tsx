/** A circular progress ring that fills slowly on load. Shows a percentage only, never the amounts behind it. */
export function Ring({ pct, label, sub, locked, tone = "orange", size = 168 }: { pct: number | null; label: string; sub?: string; locked?: boolean; tone?: "orange" | "cyan" | "violet"; size?: number }) {
  const stroke = 11;
  const r = (size - stroke) / 2 - 4;
  const C = 2 * Math.PI * r;
  const value = locked || pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const id = `g-${tone}-${label.replace(/\W/g, "")}`;
  const stops: Record<string, [string, string]> = { orange: ["#fb923c", "#f43f5e"], cyan: ["#22d3ee", "#6366f1"], violet: ["#a78bfa", "#ec4899"] };
  const [a, b] = stops[tone];
  return (
    <figure className="flex flex-col items-center text-center" aria-label={`${label}: ${locked ? "locked" : `${value} percent`}`}>
      <div className="relative" style={{ width: size, height: size }}>
        {!locked && <div aria-hidden className="ring-glow absolute inset-3 rounded-full blur-2xl" style={{ background: `radial-gradient(circle, ${a}33, transparent 70%)` }} />}
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative -rotate-90" role="img" aria-hidden>
          <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,.16)" strokeWidth={stroke} />
          {value > 0 && (
            <circle className="ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - value / 100)} style={{ ["--ring-full" as string]: C }} />
          )}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          {locked ? <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Locked</span>
            : pct == null ? <span className="px-6 text-xs text-slate-400">Not set yet</span>
            : <span className="text-3xl font-bold tabular-nums text-white">{value % 1 === 0 ? value : value.toFixed(1)}<span className="text-base text-slate-400">%</span></span>}
        </div>
      </div>
      <figcaption className="mt-3">
        <p className="text-sm font-semibold text-white">{label}</p>
        {sub && <p className="mt-0.5 max-w-[14rem] text-xs text-slate-400">{sub}</p>}
      </figcaption>
    </figure>
  );
}
