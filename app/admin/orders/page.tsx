import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { STATUS_LABEL } from "@/lib/orders";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";

export const metadata = { title: "Orders" };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status, q: term } = await searchParams;
  const { supabase } = await requireRole(["super_admin"]);
  let q = supabase.from("orders").select("id,order_no,status,created_at,items_total_kobo,pickup_agent_id,customer_id").order("created_at", { ascending: false }).limit(100);
  if (status && /^[a-z_]+$/.test(status)) q = q.eq("status", status as never);
  const needle = (term ?? "").trim().slice(0, 60);
  if (needle) {
    if (/^#?\d{1,9}$/.test(needle)) q = q.eq("order_no", Number(needle.replace("#", "")));
    else {
      const safe = needle.replace(/[%,()_\\]/g, " ").trim();
      const { data: hits } = await supabase.from("profiles").select("id").or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`).limit(50);
      q = q.in("customer_id", (hits ?? []).map((h) => h.id).concat(["00000000-0000-0000-0000-000000000000"]));
    }
  }
  const { data } = await q;
  const ids = Array.from(new Set((data ?? []).flatMap((o) => [o.customer_id, o.pickup_agent_id].filter(Boolean) as string[])));
  const { data: ppl } = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
  const n = new Map((ppl ?? []).map((p) => [p.id, p.full_name]));
  const filters = ["awaiting_dispatch", "agent_assigned", "agent_arrived", "counted", "count_confirmed", "received", "in_house", "out_for_delivery", "failed_delivery", "delivered", "cancelled"];
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Orders</h1><p className="mt-1 text-sm text-ink-soft">Open any order to see who did each step and how long it took.</p></div>
      <form className="flex gap-2" role="search"><input name="q" defaultValue={needle} aria-label="Search orders" placeholder="Order number, customer name, phone or email" className="w-full max-w-md rounded-md border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none" />{status && <input type="hidden" name="status" value={status} />}<button className="btn-secondary">Search</button>{needle && <Link href="/admin/orders" className="self-center text-sm underline">Clear</Link>}</form>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/orders" className={`rounded-full border px-3 py-1 ${!status ? "border-brand bg-brand-tint text-brand-dark" : "border-line"}`}>All</Link>
        {filters.map((f) => <Link key={f} href={`/admin/orders?status=${f}${needle ? `&q=${encodeURIComponent(needle)}` : ""}`} className={`rounded-full border px-3 py-1 ${status === f ? "border-brand bg-brand-tint text-brand-dark" : "border-line"}`}>{STATUS_LABEL[f]}</Link>)}
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
