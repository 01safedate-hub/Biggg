import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { CheckLines } from "@/components/ops/DeskTools";
import { OrderTimeline } from "@/components/orders/Timeline";
import type { Timeline } from "@/lib/orders";

export const metadata = { title: "Check and receive" };

export default async function ReceiveOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { data: o } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!o) notFound();
  const [{ data: lines }, { data: tl }] = await Promise.all([
    supabase.from("order_items").select("id,name,category_name,qty,check_state,check_note").eq("order_id", id).is("removed_at", null).order("created_at"),
    supabase.rpc("order_timeline", { _order: id }),
  ]);
  return (
    <div className="space-y-6">
      <Link href="/staff/receiving" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Receiving</Link>
      <div><h1 className="text-2xl font-bold tracking-tight">Order #{o.order_no}</h1><p className="mt-1 text-sm text-ink-soft">Paid {naira(Math.max(0, o.items_total_kobo - o.discount_kobo))} · {o.status === "received" ? "Already received" : "Open the bag and check each line"}</p></div>
      {o.status === "count_confirmed" ? <CheckLines orderId={id} lines={(lines ?? []) as never} /> : (
        <ul className="card divide-y divide-line">{(lines ?? []).map((l) => <li key={l.id} className="p-4 text-sm">{l.qty} × {l.name} <span className="text-ink-mute">({l.category_name})</span></li>)}</ul>
      )}
      {tl && <OrderTimeline t={tl as unknown as Timeline} showPeople />}
    </div>
  );
}
