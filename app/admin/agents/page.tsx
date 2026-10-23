import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { DispatchRules } from "@/components/admin/DispatchRules";

export const metadata = { title: "Agent performance" };
export const dynamic = "force-dynamic";

type A = { id: string; name: string; pickups: number; deliveries: number; failed_deliveries: number; failed_pickups: number; avg_arrival_min: number | null; avg_rating: number | null; ratings: number };
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(d);

export default async function Agents({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days } = await searchParams;
  const n = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const { supabase } = await requireRole(["super_admin"]);
  const to = new Date(); const from = new Date(Date.now() - n * 86400000);
  const { data } = await supabase.rpc("agent_performance", { _from: ymd(from), _to: ymd(to) });
  const { data: cfgRow } = await supabase.from("settings").select("value").eq("key", "dispatch").maybeSingle();
  const cfg = (cfgRow?.value ?? {}) as { auto_assign?: boolean; max_open_jobs?: number; reassign_after_minutes?: number; require_checked_in?: boolean };
  const rows = (Array.isArray(data) ? data : []) as unknown as A[];
  const chip = (d: number) => <Link key={d} href={`/admin/agents?days=${d}`} className={`rounded-full border px-3 py-1 text-sm ${n === d ? "border-brand bg-brand-tint text-brand-dark" : "border-line"}`}>Last {d} days</Link>;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Agent performance</h1><p className="mt-1 text-sm text-ink-soft">Jobs done, failures, how fast they reach customers, and what customers rate their deliveries.</p></div>
      <DispatchRules initial={{ auto: cfg.auto_assign === true, maxJobs: cfg.max_open_jobs ?? 4, reassignMin: cfg.reassign_after_minutes ?? 45, needCheckin: cfg.require_checked_in !== false }} />
      <div className="flex gap-2">{[7, 30, 90].map(chip)}</div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-mute"><th scope="col" className="p-3">Agent</th><th scope="col" className="p-3 text-right">Pickups</th><th scope="col" className="p-3 text-right">Deliveries</th><th scope="col" className="p-3 text-right">Failed pickups</th><th scope="col" className="p-3 text-right">Failed deliveries</th><th scope="col" className="p-3 text-right">Minutes to arrive</th><th scope="col" className="p-3 text-right">Rating</th></tr></thead>
          <tbody className="divide-y divide-line">{rows.map((a) => {
            const attempts = a.deliveries + a.failed_deliveries; const failRate = attempts ? Math.round((a.failed_deliveries / attempts) * 100) : 0;
            return <tr key={a.id}><th scope="row" className="p-3 text-left font-medium">{a.name}</th><td className="p-3 text-right tabular-nums">{a.pickups}</td><td className="p-3 text-right tabular-nums">{a.deliveries}</td><td className={`p-3 text-right tabular-nums ${a.failed_pickups ? "text-amber-700" : ""}`}>{a.failed_pickups}</td><td className={`p-3 text-right tabular-nums ${failRate >= 20 ? "text-red-700" : ""}`}>{a.failed_deliveries}{attempts ? ` (${failRate}%)` : ""}</td><td className="p-3 text-right tabular-nums">{a.avg_arrival_min ?? "–"}</td><td className="p-3 text-right tabular-nums">{a.avg_rating != null ? `${a.avg_rating} ★ (${a.ratings})` : "–"}</td></tr>;
          })}
          {rows.length === 0 && <tr><td colSpan={7} className="p-5 text-ink-soft">No delivery agents yet. Invite one from Staff.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}
