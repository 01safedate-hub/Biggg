import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { STATUS_LABEL } from "@/lib/orders";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";

export const metadata = { title: "Orders" };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { supabase } = await requireRole(["super_admin"]);
  let q = supabase.from("orders").select("id,order_no,status,created_at,items_total_kobo,pickup_agent_id,customer_id").order("created_at", { ascending: false }).limit(100);
  if (status && /^[a-z_]+$/.test(status)) q = q.eq("status", status as never);
  const { data } = await q;
  const ids = Array.from(new Set((data ?? []).flatMap((o) => [o.customer_id, o.pickup_agent_id].filter(Boolean) as string[])));
  const { data: ppl } = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
  const n = new Map((ppl ?? []).map((p) => [p.id, p.full_name]));
  const filters = ["awaiting_dispatch", "agent_assigned", "agent_arrived", "counted", "count_confirmed", "received"];
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Orders</h1><p className="mt-1 text-sm text-ink-soft">Open any order to see who did each step and how long it took.</p></div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/orders" className={`rounded-full border px-3 py-1 ${!status ? "border-brand bg-brand-tint text-brand-dark" : "border-line"}`}>All</Link>
        {filters.map((f) => <Link key={f} href={`/admin/orders?status=${f}`} className={`rounded-full border px-3 py-1 ${status === f ? "border-brand bg-brand-tint text-brand-dark" : "border-line"}`}>{STATUS_LABEL[f]}</Link>)}
      </div>
      <section className="card divide-y divide-line">
        {(data ?? []).map((o) => (
          <Link key={o.id} href={`/staff/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-canvas">
            <div><p className="font-medium">#{o.order_no} · {n.get(o.customer_id)}</p><p className="text-sm text-ink-soft">{STATUS_LABEL[o.status] ?? o.status}{o.pickup_agent_id ? ` · agent ${n.get(o.pickup_agent_id)}` : ""}</p></div>
            <div className="text-right text-sm"><p>{longDate(o.created_at ?? "")}</p>{o.items_total_kobo > 0 && <p className="text-ink-soft">{naira(o.items_total_kobo)}</p>}</div>
          </Link>
        ))}
        {(data ?? []).length === 0 && <p className="p-5 text-sm text-ink-soft">No orders yet.</p>}
      </section>
    </div>
  );
}
