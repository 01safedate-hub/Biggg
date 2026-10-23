import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { STATUS_LABEL, type Timeline } from "@/lib/orders";
import { OrderTimeline } from "@/components/orders/Timeline";

export const metadata = { title: "Order timeline" };

export default async function StaffOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole(["secretary", "admin", "super_admin", "cashier", "delivery_agent"]);
  const { data: o } = await supabase.from("orders").select("order_no,status,pickup_address").eq("id", id).maybeSingle();
  const { data: tl } = await supabase.rpc("order_timeline", { _order: id });
  if (!o || !tl) notFound();
  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Orders</Link>
      <div><h1 className="text-2xl font-bold tracking-tight">Order #{o.order_no}</h1><p className="mt-1 text-sm text-ink-soft">{STATUS_LABEL[o.status] ?? o.status} · {o.pickup_address}</p></div>
      <OrderTimeline t={tl as unknown as Timeline} showPeople />
    </div>
  );
}
