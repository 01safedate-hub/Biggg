import { TimeLeft } from "@/components/ops/TimeLeft";
import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";

export const metadata = { title: "Receiving" };

export default async function ReceivingPage() {
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { data } = await supabase.from("orders").select("id,order_no,status,items_total_kobo,pickup_agent_id,customer_id,updated_at,instant,instant_target_at,instant_promise_at").in("status", ["count_confirmed", "received"]).order("instant", { ascending: false }).order("updated_at", { ascending: false }).limit(60);
  const ids = Array.from(new Set((data ?? []).flatMap((o) => [o.customer_id, o.pickup_agent_id].filter(Boolean) as string[])));
  const { data: ppl } = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
  const n = new Map((ppl ?? []).map((p) => [p.id, p.full_name]));
  const waiting = (data ?? []).filter((o) => o.status === "count_confirmed");
  const done = (data ?? []).filter((o) => o.status === "received").slice(0, 15);
  const row = (o: NonNullable<typeof data>[number]) => (
    <Link key={o.id} href={`/staff/receiving/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-canvas">
      <div><p className="font-medium">Order #{o.order_no} · {n.get(o.customer_id)} {o.instant && o.instant_target_at && <TimeLeft targetAt={o.instant_target_at} promiseAt={o.instant_promise_at} />}</p><p className="text-sm text-ink-soft">Brought by {n.get(o.pickup_agent_id ?? "") ?? "agent"}</p></div>
      <p className="text-sm font-medium">{naira(o.items_total_kobo)}</p>
    </Link>
  );
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Receiving</h1><p className="mt-1 text-sm text-ink-soft">Paid orders brought in by agents. Check every line against the clothes, then mark as received.</p></div>
      <section><h2 className="mb-2 text-lg font-semibold">Waiting to be received ({waiting.length})</h2><div className="card divide-y divide-line">{waiting.map(row)}{waiting.length === 0 && <p className="p-5 text-sm text-ink-soft">Nothing waiting.</p>}</div></section>
      <section><h2 className="mb-2 text-lg font-semibold">Recently received</h2><div className="card divide-y divide-line">{done.map(row)}{done.length === 0 && <p className="p-5 text-sm text-ink-soft">None yet.</p>}</div></section>
    </div>
  );
}
