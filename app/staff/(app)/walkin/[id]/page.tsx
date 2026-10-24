import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import { Itemiser } from "@/components/ops/AgentTools";
import { WalkinActions, WalkinInstant, WalkinPay } from "@/components/ops/WalkinTools";
import { PrintButton } from "@/components/orders/PrintButton";
import { AutoRefresh } from "@/components/orders/AutoRefresh";

export const metadata = { title: "Walk-in order" };
export const dynamic = "force-dynamic";

export default async function WalkinOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { data: o } = await supabase.from("orders").select("*").eq("id", id).eq("source", "walk_in").maybeSingle();
  if (!o) notFound();
  const [{ data: cust }, { data: lines }, { data: cats }, { data: items }, { data: pts }, { data: pay }] = await Promise.all([
    supabase.from("profiles").select("full_name,phone").eq("id", o.customer_id).maybeSingle(),
    supabase.from("order_items").select("id,item_id,name,qty,unit_price_kobo,line_total_kobo").eq("order_id", id).is("removed_at", null),
    supabase.from("item_categories").select("id,name").eq("active", true).order("sort_order").order("name"),
    supabase.from("items").select("id,name,price_kobo,category_id").eq("active", true).order("sort_order").order("name"),
    supabase.from("money_points").select("id,name,kind").eq("active", true).neq("kind", "online").order("name"),
    supabase.from("payments").select("mode,amount_kobo,reference,paid_at,note").eq("order_id", id).eq("kind", "payment").eq("status", "success").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const iq = o.status === "counted" ? (await supabase.rpc("instant_quote", { _order: id })).data as unknown as { enabled: boolean; per_item_kobo: number; items: number; fee_kobo: number; on: boolean; target_hours: number } | null : null;
  const initial: Record<string, number> = {};
  for (const l of lines ?? []) if (l.item_id) initial[l.item_id] = l.qty;
  const total = Math.max(0, o.items_total_kobo - o.discount_kobo) + o.instant_fee_kobo;
  const moving = ["count_confirmed", "received", "in_house"].includes(o.status);
  const paidLabel = pay ? (pay.mode === "cash" ? "Cash" : pay.mode === "transfer" ? "Bank transfer" : "POS card") : "";
  return (
    <div className="space-y-5">
      {moving && <AutoRefresh seconds={20} />}
      <div className="flex items-center justify-between print:hidden"><Link href="/staff/walkin" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Walk-in orders</Link>{pay && <PrintButton />}</div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Order #{o.order_no} <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-sm font-medium text-ink-soft print:hidden">{STATUS_LABEL[o.status] ?? o.status}</span></h1>
        <p className="mt-1 text-sm text-ink-soft">{cust?.full_name}{cust?.phone ? ` · ${cust.phone}` : ""} · walk-in at the hub</p>
        {o.notes && <p className="mt-1 text-sm">Note: {o.notes}</p>}
      </div>

      {o.status === "agent_arrived" && (
        <section className="space-y-3 print:hidden">
          <h2 className="text-lg font-semibold">1. Count the clothes with the customer</h2>
          <Itemiser desk orderId={id} cats={cats ?? []} items={(items ?? []).map((i) => ({ ...i, price_kobo: Number(i.price_kobo) }))} initial={initial} />
          <WalkinActions orderId={id} kind="cancel" />
        </section>
      )}

      {o.status === "counted" && (
        <section className="card space-y-4 p-5 print:hidden">
          <h2 className="text-lg font-semibold">2. Take payment</h2>
          <ul className="divide-y divide-line text-sm">{(lines ?? []).map((l) => <li key={l.id} className="flex justify-between py-2"><span>{l.qty} × {l.name}</span><span>{naira(l.line_total_kobo ?? 0)}</span></li>)}</ul>
          {iq?.enabled && <WalkinInstant orderId={id} on={iq.on} perItemKobo={iq.per_item_kobo} items={iq.items} feeKobo={iq.fee_kobo} targetHours={iq.target_hours} />}
          {o.instant_fee_kobo > 0 && <p className="text-sm text-ink-soft">Includes instant delivery {naira(o.instant_fee_kobo)}.</p>}
          <p className="text-2xl font-bold">Customer pays {naira(total)}</p>
          <WalkinPay orderId={id} points={(pts ?? []).map((p) => ({ id: p.id, name: p.name }))} due={naira(total)} />
          <div className="flex flex-wrap gap-4 border-t border-line pt-4"><WalkinActions orderId={id} kind="reopen" /><WalkinActions orderId={id} kind="cancel" /></div>
        </section>
      )}

      {moving && <p className="card p-5 text-sm text-ink-soft print:hidden">Paid. {o.status === "count_confirmed" ? "Next: mark it received on the Receiving page, then it joins the wash queue." : "It is in the wash queue. It will show as ready here when washing is done."}</p>}
      {o.status === "ready" && <section className="card space-y-3 p-5 print:hidden"><h2 className="text-lg font-semibold">Clothes are ready</h2><p className="text-sm text-ink-soft">Give them to the customer, then confirm below.</p><WalkinActions orderId={id} kind="handover" /></section>}
      {o.status === "delivered" && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 print:hidden">The customer has collected their clothes.</p>}
      {o.status === "cancelled" && <p className="rounded-md border border-line bg-canvas p-3 text-sm text-ink-soft print:hidden">This order was cancelled.</p>}

      {pay && (
        <section className="card p-5">
          <h2 className="text-lg font-semibold">Receipt</h2>
          <p className="text-sm text-ink-soft">Order #{o.order_no} · {pay.paid_at ? new Date(pay.paid_at).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }) : ""}</p>
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y divide-line">{(lines ?? []).map((l) => <tr key={l.id}><td className="py-2">{l.qty} × {l.name}</td><td className="py-2 text-right">{naira(l.line_total_kobo ?? 0)}</td></tr>)}</tbody>
            <tfoot><tr className="font-semibold"><td className="pt-3">Paid ({paidLabel})</td><td className="pt-3 text-right">{naira(pay.amount_kobo)}</td></tr></tfoot>
          </table>
          <p className="mt-2 text-xs text-ink-mute">Reference {pay.reference}</p>
        </section>
      )}
    </div>
  );
}
