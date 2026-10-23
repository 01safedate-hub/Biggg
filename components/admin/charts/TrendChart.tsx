"use client";

import { useEffect, useId, useRef, useState } from "react";
import { compactNaira } from "@/lib/dash";
import { naira } from "@/lib/format";
import { C } from "./theme";

type Row = { day: string; a: number; b: number };
const L = 56, R = 14, T = 12, B = 30;

function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
const fmtDay = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** Two lines over time (sales and spending) with a crosshair that reads out both. Values are kobo. */
export function TrendChart({ rows, aLabel, bLabel }: { rows: Row[]; aLabel: string; bLabel: string }) {
  const [i, setI] = useState<number | null>(null);
  const [W, setW] = useState(720);
  const ref = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // Draw at the real pixel width so text stays the size it was written, on a phone as well as a desktop.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setW(Math.max(300, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 240 : 260;
  const id = useId();
  const n = rows.length;
  const max = niceMax(Math.max(1, ...rows.flatMap((r) => [r.a, r.b])));
  const x = (k: number) => L + (n <= 1 ? (W - L - R) / 2 : (k * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = (key: "a" | "b") => rows.map((r, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(r[key]).toFixed(1)}`).join(" ");
  const area = `${path("a")} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.max(1, Math.ceil(n / (W < 480 ? 4 : 6)));

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = ref.current?.getBoundingClientRect();
    if (!box || n === 0) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    setI(Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1)))));
  }
  const cur = i !== null ? rows[i] : null;
  const last = rows[n - 1];

  return (
    <div className="relative" ref={wrap}>
      <ul className="mb-2 flex flex-wrap gap-4 text-sm text-ink-soft" aria-label="Legend">
        {[[aLabel, C.sales], [bLabel, C.spend]].map(([l, c]) => (
          <li key={l} className="flex items-center gap-2"><span aria-hidden className="inline-block h-0.5 w-5 rounded" style={{ background: c, height: 2 }} />{l}</li>
        ))}
      </ul>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full touch-pan-y" role="img" aria-labelledby={`${id}-t`}
           onPointerMove={onMove} onPointerLeave={() => setI(null)}>
        <title id={`${id}-t`}>{`${aLabel} and ${bLabel} by day, with a full table below`}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#64748b">{compactNaira(t)}</text>
          </g>
        ))}
        {rows.map((r, k) => ((k % labelEvery === 0 && n - 1 - k >= labelEvery / 2) || k === n - 1) && (
          <text key={r.day} x={x(k)} y={H - 8} textAnchor={k === 0 ? "start" : k === n - 1 ? "end" : "middle"} fontSize={11} fill="#64748b">{fmtDay(r.day)}</text>
        ))}
        <path d={area} fill={C.sales} opacity={0.1} />
        <path d={path("a")} fill="none" stroke={C.sales} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={path("b")} fill="none" stroke={C.spend} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {last && i === null && (
          <>
            <circle cx={x(n - 1)} cy={y(last.a)} r={4} fill={C.sales} stroke="#fff" strokeWidth={2} />
            <circle cx={x(n - 1)} cy={y(last.b)} r={4} fill={C.spend} stroke="#fff" strokeWidth={2} />
          </>
        )}
        {cur && i !== null && (
          <>
            <line x1={x(i)} x2={x(i)} y1={T} y2={H - B} stroke="#94a3b8" strokeWidth={1} />
            <circle cx={x(i)} cy={y(cur.a)} r={4} fill={C.sales} stroke="#fff" strokeWidth={2} />
            <circle cx={x(i)} cy={y(cur.b)} r={4} fill={C.spend} stroke="#fff" strokeWidth={2} />
          </>
        )}
      </svg>
      {cur && i !== null && (
        <div role="status" className="pointer-events-none absolute top-8 rounded-md border border-line bg-white px-3 py-2 text-xs shadow-card"
             style={{ left: `${Math.min(78, Math.max(2, (x(i) / W) * 100 - 8))}%` }}>
          <p className="text-ink-mute">{fmtDay(cur.day)}</p>
          <p className="mt-1 flex items-center gap-2"><span aria-hidden className="inline-block w-4" style={{ borderTop: `2px solid ${C.sales}` }} /><strong className="text-sm text-ink">{naira(cur.a)}</strong><span className="text-ink-mute">{aLabel}</span></p>
          <p className="mt-0.5 flex items-center gap-2"><span aria-hidden className="inline-block w-4" style={{ borderTop: `2px solid ${C.spend}` }} /><strong className="text-sm text-ink">{naira(cur.b)}</strong><span className="text-ink-mute">{bLabel}</span></p>
        </div>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-brand-dark">View as table</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-md border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-canvas"><tr><th className="px-3 py-2">Day</th><th className="px-3 py-2">{aLabel}</th><th className="px-3 py-2">{bLabel}</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.day} className="border-t border-line"><td className="px-3 py-1.5">{fmtDay(r.day)}</td><td className="px-3 py-1.5">{naira(r.a)}</td><td className="px-3 py-1.5">{naira(r.b)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
