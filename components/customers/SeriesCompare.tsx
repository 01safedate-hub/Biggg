"use client";

import { useState } from "react";
import { Columns } from "./Columns";
import { dayLabel, monthLabel, weekLabel, type SeriesPoint } from "@/lib/customers";

const VIEWS = [
  { key: "daily", label: "Daily (30 days)", fmt: dayLabel },
  { key: "weekly", label: "Weekly (12 weeks)", fmt: weekLabel },
  { key: "monthly", label: "Monthly (12 months)", fmt: monthLabel },
] as const;

const change = (cur: number, prev: number | undefined) => {
  if (prev === undefined) return { text: "–", tone: "text-ink-mute" };
  if (prev === 0) return cur === 0 ? { text: "–", tone: "text-ink-mute" } : { text: "New", tone: "text-emerald-700" };
  const p = Math.round(((cur - prev) / prev) * 100);
  return p === 0 ? { text: "0%", tone: "text-ink-mute" } : { text: `${p > 0 ? "▲" : "▼"} ${Math.abs(p)}%`, tone: p > 0 ? "text-emerald-700" : "text-red-700" };
};

export function SeriesCompare({ data }: { data: Record<"daily" | "weekly" | "monthly", SeriesPoint[]> }) {
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("weekly");
  const v = VIEWS.find((x) => x.key === view)!;
  const pts = data[view];
  const rows = pts.map((p) => ({ label: v.fmt(p.bucket).replace("Week of ", ""), values: { signups: p.signups, new_customers: p.new_customers, returning: Math.max(0, p.active - p.new_customers) } }));
  const table = [...pts].reverse().slice(0, view === "daily" ? 14 : 12);
  const sumLatest = (k: keyof SeriesPoint) => Number(pts[pts.length - 1]?.[k] ?? 0);
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Compare by" className="inline-flex rounded-lg border border-line bg-canvas p-1 text-sm">
        {VIEWS.map((x) => <button key={x.key} role="tab" aria-selected={view === x.key} onClick={() => setView(x.key)} className={`rounded-md px-3 py-1.5 font-medium ${view === x.key ? "bg-white shadow-sm" : "text-ink-soft"}`}>{x.label}</button>)}
      </div>
      <Columns rows={rows} series={[{ key: "signups", label: "Signed up", color: "#94a3b8" }, { key: "new_customers", label: "First order", color: "#2a78d6" }, { key: "returning", label: "Returning customers ordering", color: "#1baf7a" }]} empty="No signups or orders in this period yet." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead><tr className="border-b border-line text-ink-mute"><th className="py-2 pr-4 font-medium">Period</th><th className="py-2 pr-4 font-medium">Signed up</th><th className="py-2 pr-4 font-medium">First orders</th><th className="py-2 pr-4 font-medium">Returning</th><th className="py-2 pr-4 font-medium">Orders</th><th className="py-2 font-medium">Signups vs before</th></tr></thead>
          <tbody>
            {table.map((p) => {
              const idx = pts.indexOf(p);
              const c = change(p.signups, pts[idx - 1]?.signups);
              return (
                <tr key={p.bucket} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 pr-4 font-medium text-ink-soft">{v.fmt(p.bucket)}</th>
                  <td className="py-2 pr-4 font-semibold tabular-nums">{p.signups}</td><td className="py-2 pr-4 tabular-nums">{p.new_customers}</td>
                  <td className="py-2 pr-4 tabular-nums">{Math.max(0, p.active - p.new_customers)}</td><td className="py-2 pr-4 tabular-nums">{p.orders}</td>
                  <td className={`py-2 font-medium ${c.tone}`}>{c.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-mute">Latest period: {sumLatest("signups")} signed up, {sumLatest("new_customers")} placed a first order, {sumLatest("orders")} orders in total. Periods run on Lagos time; weeks start on Monday.</p>
    </div>
  );
}
