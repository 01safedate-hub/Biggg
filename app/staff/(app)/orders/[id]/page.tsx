import { StainList } from "@/components/orders/StainList";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { STATUS_LABEL, type Timeline } from "@/lib/orders";
import { OrderTimeline } from "@/components/orders/Timeline";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";
import { MoveShelves } from "@/components/ops/MoveShelves";

export const metadata = { title: "Order details" };
export const dynamic = "force-dynamic";

const SOURCE: Record<string, string> = { online: "Online booking", walk_in: "Walk-in at the desk", whatsapp: "WhatsApp", subscription: "Subscription", one_time: "One-time pickup" };
const ON_SHELF = ["ready", "awaiting_delivery_fare", "out_for_delivery", "failed_delivery"];

export default async function StaffOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, roles } = await requireRole(["secretary", "admin", "super_admin", "cashier", "delivery_agent"]);
  const desk = roles.some((r) => ["secretary", "admin", "super_admin", "cashier"].includes(r));
  const { data: o } = await supabase.from("orders")
    .select("order_no,status,source,created_at,customer_id,pickup_address,return_delivery_address,fulfillment_choice,notes,items_total_kobo,discount_kobo,instant,instant_fee_kobo,pickup_fare_kobo,delivery_fare_kobo,demurrage_kobo,ready_at,delivered_at,pickup_agent_id,delivery_agent_id")
    .eq("id", id).maybeSingle();
  const { data: tl } = await supabase.rpc("order_timeline", { _order: id });
  if (!o || !tl) notFound();
  const [{ data: rt }, { data: items }, { data: shelves }, { data: pays }, { data: ppl }] = await Promise.all([
    supabase.from("order_ratings").select("stars,comment").eq("order_id", id).maybeSingle(),
    supabase.from("order_items").select("id,name,category_name,qty,unit_price_kobo,line_total_kobo,service,check_state").eq("order_id", id).is("removed_at", null).order("created_at"),
    supabase.from("order_shelves").select("shelf,placed_at").eq("order_id", id).is("released_at", null).order("shelf"),
    desk ? supabase.from("payments").select("id,purpose,kind,mode,amount_kobo,status,paid_at,created_at").eq("order_id", id).order("created_at") : Promise.resolve({ data: [] as { id: string; purpose: string; kind: string; mode: string; amount_kobo: number; status: string; paid_at: string | null; created_at: string | null }[] }),
    supabase.from("profiles").select("id,full_name,phone,email").in("id", [o.customer_id, o.pickup_agent_id, o.delivery_agent_id].filter(Boolean) as string[]),
  ]);
  const who = new Map((ppl ?? []).map((p) => [p.id, p]));
  const cust = who.get(o.customer_id);
  const pieces = (items ?? []).reduce((a, i) => a + i.qty, 0);
  const shelfList = (shelves ?? []).map((s) => s.shelf);
  const bill = Math.max(0, o.items_total_kobo - o.discount_kobo) + o.instant_fee_kobo;
  const paidItems = (pays ?? []).filter((p) => p.status === "success" && p.purpose === "items").reduce((a, p) => a + (p.kind === "refund" ? -p.amount_kobo : p.amount_kobo), 0);
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 py-1.5"><dt className="text-ink-soft">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;

  return (
    <div className="space-y-6">
      <Link href={desk ? "/staff/orders" : "/staff/jobs"} className="text-sm font-medium text-ink-soft hover:text-ink">&larr; {desk ? "Orders" : "My jobs"}</Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Order #{o.order_no}</h1>
        <p className="mt-1 text-sm text-ink-soft">{STATUS_LABEL[o.status] ?? o.status} · {SOURCE[o.source] ?? o.source}{o.instant ? " · Instant" : ""} · booked {longDate(o.created_at ?? "")}</p>
      </div>

      <section className={`card p-5 ${shelfList.length ? "border-brand" : ""}`} aria-label="Shelf">
        <h2 className="text-lg font-semibold">Shelf</h2>
        {shelfList.length ? <p className="mt-1 text-2xl font-bold tracking-tight">{shelfList.join(", ")}</p> : <p className="mt-1 text-sm text-ink-soft">{["delivered", "closed"].includes(o.status) ? "Off the shelf: the clothes have left." : "Not on a shelf yet. A shelf is chosen when the order is marked ready."}</p>}
        {desk && shelfList.length > 0 && ON_SHELF.includes(o.status) && <div className="mt-2"><MoveShelves orderId={id} current={shelfList} use={{}} /></div>}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5" aria-label="Customer">
          <h2 className="text-lg font-semibold">Customer</h2>
          <dl className="mt-2 divide-y divide-line text-sm">
            {row("Name", cust?.full_name ?? "—")}
            {row("Phone", cust?.phone ? <a className="underline" href={`tel:${cust.phone}`}>{cust.phone}</a> : "—")}
            {desk && row("Email", cust?.email ?? "—")}
            {row("Pickup address", o.pickup_address ?? "Dropped at the desk")}
            {o.fulfillment_choice && row("Return", o.fulfillment_choice === "deliver" ? `Deliver to ${o.return_delivery_address ?? o.pickup_address ?? "address"}` : "Customer collects")}
            {o.pickup_agent_id && row("Pickup agent", who.get(o.pickup_agent_id)?.full_name ?? "—")}
            {o.delivery_agent_id && row("Delivery agent", who.get(o.delivery_agent_id)?.full_name ?? "—")}
            {o.notes && row("Notes", o.notes)}
          </dl>
        </section>

        <section className="card p-5" aria-label="Money">
          <h2 className="text-lg font-semibold">Money</h2>
          <dl className="mt-2 divide-y divide-line text-sm">
            {row("Clothes", naira(o.items_total_kobo))}
            {o.discount_kobo > 0 && row("Discount", `− ${naira(o.discount_kobo)}`)}
            {o.instant_fee_kobo > 0 && row("Instant fee", naira(o.instant_fee_kobo))}
            {row("Bill", naira(bill))}
            {desk && row("Paid for clothes", naira(paidItems))}
            {o.pickup_fare_kobo > 0 && row("Pickup fare", naira(o.pickup_fare_kobo))}
            {o.delivery_fare_kobo > 0 && row("Delivery fare", naira(o.delivery_fare_kobo))}
            {o.demurrage_kobo > 0 && row("Storage charge", naira(o.demurrage_kobo))}
          </dl>
        </section>
      </div>

      <section className="card p-5" aria-label="Clothes">
        <h2 className="text-lg font-semibold">Clothes ({pieces} pieces)</h2>
        <ul className="mt-2 divide-y divide-line text-sm">
          {(items ?? []).map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2">
              <span>{i.qty} × {i.name}{i.category_name ? <span className="text-ink-soft"> · {i.category_name}</span> : null}{i.service && i.service !== "wash_iron" ? <span className="text-ink-soft"> · {i.service.replace(/_/g, " ")}</span> : null}{i.check_state && i.check_state !== "ok" && i.check_state !== "pending" ? <span className="text-amber-700"> · {i.check_state}</span> : null}</span>
              <span className="tabular-nums">{naira(i.line_total_kobo ?? i.qty * i.unit_price_kobo)}</span>
            </li>
          ))}
          {(items ?? []).length === 0 && <li className="py-2 text-ink-soft">Not counted yet.</li>}
        </ul>
      </section>

      {desk && (pays ?? []).length > 0 && (
        <section className="card p-5" aria-label="Payments">
          <h2 className="text-lg font-semibold">Payments</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {(pays ?? []).map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2">
                <span>{p.kind === "refund" ? "Refund" : "Payment"} · {p.purpose.replace(/_/g, " ")} · {p.mode} · <span className={p.status === "success" ? "text-emerald-700" : "text-ink-soft"}>{p.status}</span></span>
                <span className="tabular-nums">{p.kind === "refund" ? "− " : ""}{naira(p.amount_kobo)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rt && <p className="rounded-md border border-line bg-white p-3 text-sm"><span className="text-amber-500">{"★".repeat(rt.stars)}</span><span className="text-slate-300">{"★".repeat(5 - rt.stars)}</span> Customer rating{rt.comment ? `: "${rt.comment}"` : ""}</p>}
      <StainList supabase={supabase} orderId={id} />
      <section aria-label="Timeline"><h2 className="mb-2 text-lg font-semibold">Who did each step</h2><OrderTimeline t={tl as unknown as Timeline} showPeople /></section>
    </div>
  );
}
