"use client";

import { useMemo, useState } from "react";
import { naira } from "@/lib/format";

export type ChartBucket = "day" | "week" | "month" | "all";
export type ChartBar = { start: string; end: string; modes: Record<string, number>; total_kobo: number; expenses_kobo: number };
export type ChartData = { bucket: ChartBucket; from: string; to: string; bars: ChartBar[]; best_day: { day: string; total_kobo: number } | null };

/** Payment channels in a fixed stacking order (bottom to top). Colours validated for colour-blind separation; never reassigned by rank. */
const CHANNELS = [
  { key: "paystack", label: "Paystack", color: "#2a78d6" },
  { key: "flutterwave", label: "Flutterwave", color: "#eb6834" },
  { key: "cash", label: "Cash", color: "#1baf7a" },
  { key: "pos", label: "POS", color: "#eda100" },
  { key: "transfer", label: "Bank transfer", color: "#e87ba4" },
] as const;
const OTHER = { key: "other", label: "Other", color: "#8b8a85" };
const EXPENSE_COLOR = "#cbd5e1"; // neutral: expenses hang below the line on the same naira scale

const TABS: { key: ChartBucket; label: string }[] = [
  { key: "day", label: "Daily" }, { key: "week", label: "Weekly" }, { key: "month", label: "Monthly" }, { key: "all", label: "All time" },
];

const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => utc(d).toLocaleDateString("en-NG", { timeZone: "UTC", ...o });
const compact = (kobo: number) => {
  const n = kobo / 100;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}m`;
  if (n >= 1_000) return `₦${Math.round(n / 1_000)}k`;
  return `₦${Math.round(n)}`;
};
const tickLabel = (bar: ChartBar, bucket: ChartBucket) =>
  bucket === "day" ? fmt(bar.start, { day: "numeric", month: "short" })
  : bucket === "week" ? fmt(bar.start, { day: "numeric", month: "short" })
  : fmt(bar.start, { month: "short", year: bucket === "all" ? "numeric" : undefined });
const periodLabel = (bar: ChartBar, bucket: ChartBucket) =>
  bucket === "day" ? fmt(bar.start, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  : bucket === "week" ? `Week of ${fmt(bar.start, { day: "numeric", month: "short" })} – ${fmt(bar.end, { day: "numeric", month: "short", year: "numeric" })}`
  : fmt(bar.start, { month: "long", year: "numeric" });

function segments(bar: ChartBar) {
  const known = new Set<string>(CHANNELS.map((c) => c.key));
  const rows = CHANNELS.map((c) => ({ ...c, kobo: Math.max(0, Number(bar.modes[c.key] ?? 0)) }));
  const other = Object.entries(bar.modes).filter(([k]) => !known.has(k)).reduce((s, [, v]) => s + Math.max(0, Number(v)), 0);
  return other > 0 ? [...rows, { ...OTHER, kobo: other }] : rows;
}
/** Channels where refunds outweighed takings in the period (net negative). Shown as their own minus line, never stacked. */
function refunds(bar: ChartBar) {
  const names = new Map<string, string>([...CHANNELS.map((c) => [c.key, c.label] as [string, string])]);
  return Object.entries(bar.modes).filter(([, v]) => Number(v) < 0).map(([k, v]) => ({ key: k, label: `Refund · ${names.get(k) ?? k}`, kobo: Number(v) }));
}
const stacked = (bar: ChartBar) => segments(bar).reduce((s, x) => s + x.kobo, 0);

export function RevenueChart({ data }: { data: Record<ChartBucket, ChartData | null> }) {
  const [bucket, setBucket] = useState<ChartBucket>("day");
  const current = data[bucket];
  const bars = useMemo(() => current?.bars ?? [], [current]);
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked !== null && picked < bars.length ? picked : (() => {
    for (let i = bars.length - 1; i >= 0; i--) if (bars[i].total_kobo > 0 || bars[i].expenses_kobo > 0) return i;
    return bars.length - 1;
  })();

  const maxUp = Math.max(1, ...bars.map(stacked));
  const maxDown = Math.max(0, ...bars.map((b) => b.expenses_kobo));
  const H = 220;
  const upH = Math.round((H * maxUp) / (maxUp + maxDown));
  const downH = H - upH;
  const scale = (maxUp + maxDown) / H; // kobo per pixel, shared by both directions (one axis)
  const labelEvery = bars.length > 20 ? 5 : bars.length > 8 ? 2 : 1;
  const totals = bars.reduce((a, b) => ({ sales: a.sales + b.total_kobo, exp: a.exp + b.expenses_kobo }), { sales: 0, exp: 0 });
  const ALWAYS = new Set(["paystack", "flutterwave", "cash", "pos"]);
  const usedChannels = [...CHANNELS, OTHER].filter((c) => ALWAYS.has(c.key) || bars.some((b) => segments(b).some((s) => s.key === c.key && s.kobo > 0)));
  const sel = bars[selected];
  const selRows = sel ? segments(sel).filter((s) => s.kobo > 0) : [];
  const selRefunds = sel ? refunds(sel) : [];
  const empty = totals.sales === 0 && totals.exp === 0;

  return (
    <section aria-label="Sales by payment channel" className="card space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Sales by payment channel</h2>
          <p className="text-sm text-ink-soft">
            {naira(totals.sales)} in sales · {naira(totals.exp)} approved expenses · <span className={totals.sales - totals.exp >= 0 ? "text-emerald-700" : "text-red-700"}>{naira(totals.sales - totals.exp)} net</span>
          </p>
        </div>
        <div role="tablist" aria-label="Group by" className="inline-flex rounded-lg border border-line bg-canvas p-0.5 text-sm">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={bucket === t.key} onClick={() => { setBucket(t.key); setPicked(null); }}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${bucket === t.key ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft" aria-label="Legend">
        {usedChannels.map((c) => <li key={c.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />{c.label}</li>)}
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: EXPENSE_COLOR }} />Expenses (below the line)</li>
      </ul>

      {empty ? (
        <p className="rounded-md bg-canvas p-6 text-center text-sm text-ink-soft">No sales or expenses in this period yet.</p>
      ) : (
        <div className="relative">
          {/* Recessive guides: top of sales, the zero line, bottom of expenses. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 text-[11px] text-ink-mute" style={{ height: 0 }}>
            <span className="-translate-y-1/2 bg-white pr-1 tabular-nums">{compact(maxUp)}</span><span className="h-px flex-1 border-t border-dashed border-slate-200" />
          </div>
          <div className="pointer-events-none absolute inset-x-0 border-t border-slate-300" style={{ top: upH }} />
          {maxDown > 0 && (
            <div className="pointer-events-none absolute inset-x-0 flex items-center gap-2 text-[11px] text-ink-mute" style={{ top: H, height: 0 }}>
              <span className="-translate-y-1/2 bg-white pr-1 tabular-nums">−{compact(maxDown)}</span><span className="h-px flex-1 border-t border-dashed border-slate-200" />
            </div>
          )}

          <div className="flex items-stretch gap-[2px] pl-10" style={{ height: H }}>
            {bars.map((b, i) => {
              const segs = segments(b).filter((s) => s.kobo > 0);
              const upPx = stacked(b) / scale;
              const downPx = b.expenses_kobo / scale;
              const isSel = i === selected;
              return (
                <button key={b.start} type="button" onClick={() => setPicked(i)} onMouseEnter={() => setPicked(i)} onFocus={() => setPicked(i)}
                  aria-pressed={isSel} aria-label={`${periodLabel(b, bucket)}: sales ${naira(b.total_kobo)}, expenses ${naira(b.expenses_kobo)}`}
                  className="group relative flex min-w-0 flex-1 flex-col items-center outline-none">
                  <span className={`absolute inset-x-0 inset-y-0 rounded-md transition-colors ${isSel ? "bg-slate-100" : "group-hover:bg-slate-50"}`} />
                  <span className="relative flex w-full max-w-[28px] flex-col-reverse justify-start" style={{ height: upH }}>
                    <span className="flex flex-col-reverse gap-[2px]" style={{ height: Math.max(segs.length ? 2 : 0, upPx) }}>
                      {segs.map((s, k) => (
                        <span key={s.key} className={`block w-full transition-opacity ${k === segs.length - 1 ? "rounded-t-[4px]" : ""} ${picked !== null && !isSel ? "opacity-60" : ""}`}
                          style={{ background: s.color, flexGrow: s.kobo, flexBasis: 0, minHeight: 2 }} />
                      ))}
                    </span>
                  </span>
                  <span className="relative flex w-full max-w-[28px] flex-col" style={{ height: downH }}>
                    {downPx > 0 && <span className={`block w-full rounded-b-[4px] ${picked !== null && !isSel ? "opacity-60" : ""}`} style={{ height: Math.max(2, downPx), background: EXPENSE_COLOR, backgroundImage: "repeating-linear-gradient(135deg, transparent 0 3px, rgba(100,116,139,.35) 3px 4px)" }} />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex gap-[2px] pl-10 text-[11px] text-ink-mute" aria-hidden="true">
            {bars.map((b, i) => (
              <span key={b.start} className="min-w-0 flex-1 text-center">{(i % labelEvery === 0 || i === bars.length - 1) && (i === bars.length - 1 || bars.length - 1 - i >= labelEvery / 2 || labelEvery === 1) ? tickLabel(b, bucket) : ""}</span>
            ))}
          </div>
        </div>
      )}

      {sel && !empty && (
        <div className="grid gap-4 rounded-xl border border-line bg-canvas p-4 sm:grid-cols-[1fr_auto]" aria-live="polite">
          <div>
            <p className="text-sm font-semibold">{periodLabel(sel, bucket)}</p>
            {selRows.length === 0 ? <p className="mt-2 text-sm text-ink-soft">No sales.</p> : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {selRows.map((s) => {
                  const pct = stacked(sel) > 0 ? Math.round((s.kobo / stacked(sel)) * 100) : 0;
                  return (
                    <li key={s.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                      <span className="text-ink-soft">{s.label} <span className="text-ink-mute">· {pct === 0 ? "<1" : pct}%</span></span>
                      <span className="font-medium tabular-nums">{naira(s.kobo)}</span>
                    </li>
                  );
                })}
                {selRefunds.map((r) => (
                  <li key={r.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm border border-slate-400" />
                    <span className="text-ink-soft">{r.label}</span>
                    <span className="font-medium tabular-nums text-red-700">−{naira(Math.abs(r.kobo))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <dl className="grid min-w-44 grid-cols-2 gap-x-4 gap-y-1 self-start text-sm sm:border-l sm:border-line sm:pl-4">
            <dt className="text-ink-soft">Sales{selRefunds.length ? " (after refunds)" : ""}</dt><dd className="text-right font-semibold tabular-nums">{naira(sel.total_kobo)}</dd>
            <dt className="text-ink-soft">Expenses</dt><dd className="text-right tabular-nums">{sel.expenses_kobo > 0 ? "−" : ""}{naira(sel.expenses_kobo)}</dd>
            <dt className="border-t border-line pt-1 font-medium">Net</dt>
            <dd className={`border-t border-line pt-1 text-right font-semibold tabular-nums ${sel.total_kobo - sel.expenses_kobo >= 0 ? "text-emerald-700" : "text-red-700"}`}>{naira(sel.total_kobo - sel.expenses_kobo)}</dd>
          </dl>
        </div>
      )}

      {current?.best_day && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">★ Best day{bucket === "all" ? " ever" : " in this view"}</span>
          <span className="text-ink-soft">{fmt(current.best_day.day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          <span className="font-semibold tabular-nums">{naira(current.best_day.total_kobo)}</span>
        </p>
      )}

      {!empty && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-soft hover:text-ink">Show as a table</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-line text-ink-mute"><th className="py-1 pr-3">Period</th>{usedChannels.map((c) => <th key={c.key} className="py-1 pr-3 text-right">{c.label}</th>)}<th className="py-1 pr-3 text-right">Sales</th><th className="py-1 pr-3 text-right">Expenses</th><th className="py-1 text-right">Net</th></tr></thead>
              <tbody>
                {bars.filter((b) => b.total_kobo || b.expenses_kobo).map((b) => {
                  const segs = segments(b);
                  return (
                    <tr key={b.start} className="border-b border-line/60">
                      <td className="py-1 pr-3">{periodLabel(b, bucket)}</td>
                      {usedChannels.map((c) => <td key={c.key} className="py-1 pr-3 text-right tabular-nums">{naira(segs.find((s) => s.key === c.key)?.kobo ?? 0)}</td>)}
                      <td className="py-1 pr-3 text-right font-medium tabular-nums">{naira(b.total_kobo)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{naira(b.expenses_kobo)}</td>
                      <td className="py-1 text-right tabular-nums">{naira(b.total_kobo - b.expenses_kobo)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
