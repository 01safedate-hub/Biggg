import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/roles";
import { CUSTOMER_STEPS, STATUS_LABEL, mapsLink, type Timeline } from "@/lib/orders";
import { naira } from "@/lib/format";
import { NoCashNotice } from "@/components/orders/NoCashNotice";
import { PayButtons } from "@/components/orders/PayButtons";
import { ArrivalCodeForm } from "@/components/orders/ArrivalCodeForm";
import { CancelButton } from "@/components/orders/CancelButton";
import { AutoRefresh } from "@/components/orders/AutoRefresh";
import { OrderTimeline } from "@/components/orders/Timeline";

export const metadata = { title: "Your order" };
export const dynamic = "force-dynamic";

const LIVE = ["awaiting_dispatch", "agent_assigned", "agent_arrived", "counted", "count_confirmed", "received", "in_house", "ready", "out_for_delivery"];

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returning?: string }> }) {
  const { id } = await params;
  const { returning } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/orders/${id}`);
  const { data: o } = await supabase.from("orders").select("*").eq("id", id).eq("customer_id", user.id).maybeSingle();
  if (!o) notFound();
  const agentId = ["out_for_delivery", "failed_delivery"].includes(o.status) ? o.delivery_agent_id : o.pickup_agent_id;
  const [{ data: lines }, { data: tl }, { data: agent }, { data: bal }] = await Promise.all([
    supabase.from("order_items").select("id,name,category_name,qty,unit_price_kobo,line_total_kobo").eq("order_id", id).is("removed_at", null).order("created_at"),
    supabase.rpc("order_timeline", { _order: id }),
    agentId ? supabase.from("profiles").select("full_name,phone").eq("id", agentId).maybeSingle() : Promise.resolve({ data: null }),
    o.status === "count_confirmed" ? supabase.rpc("items_balance", { _order: id }) : Promise.resolve({ data: 0 }),
  ]);
  const topUp = Math.max(0, Number(bal ?? 0));
  const timeline = tl as unknown as Timeline | null;
  const due = Math.max(0, o.items_total_kobo - o.discount_kobo);
  const confirming = returning === "1" && o.status === "awaiting_fare_payment";
  const showNotice = ["awaiting_fare_payment", "awaiting_dispatch", "agent_assigned", "agent_arrived", "counted", "ready", "out_for_delivery"].includes(o.status);
  const map = mapsLink(o.pickup_lat, o.pickup_lng);

  return (
    <main id="main" className="container-page max-w-2xl space-y-6 py-10">
      {(LIVE.includes(o.status) || confirming) && <AutoRefresh seconds={5} />}
      <Link href="/orders" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; My orders</Link>
      <div><h1 className="text-3xl font-bold tracking-tight">Order #{o.order_no}</h1><p className="mt-1 text-ink-soft">{STATUS_LABEL[o.status] ?? o.status}</p></div>
      {showNotice && <NoCashNotice />}

      <ol className="grid grid-cols-4 gap-2 text-center text-xs sm:grid-cols-8" aria-label="Progress">
        {CUSTOMER_STEPS.map((s) => {
          const on = s.reached.includes(o.status);
          return <li key={s.label} className={`rounded-md border px-1 py-2 ${on ? "border-brand bg-brand-tint font-semibold text-brand-dark" : "border-line text-ink-mute"}`}>{s.label}</li>;
        })}
      </ol>

      {o.status === "awaiting_fare_payment" && (
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold">Pay the pickup fare to confirm</h2>
          {confirming && <p role="status" className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Confirming your payment. This page updates by itself.</p>}
          <p className="text-sm text-ink-soft">Fare for the return trip: <strong>{naira(o.pickup_fare_kobo)}</strong>{o.after_hours && o.scheduled_for ? " · we are closed now, so the pickup is scheduled for our next opening time" : ""}.</p>
          <PayButtons orderId={id} purpose="pickup_fare" label={`Pay ${naira(o.pickup_fare_kobo)}`} />
          <CancelButton orderId={id} />
        </section>
      )}

      {o.status === "awaiting_dispatch" && <section className="card p-5 text-sm text-ink-soft">Your fare is paid. We are assigning an agent and will tell you the moment one is on the way.</section>}

      {o.status === "agent_assigned" && (
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold">Your agent{agent?.full_name ? `, ${agent.full_name},` : ""} is on the way</h2>
          {agent?.phone && <p className="text-sm">Call: <a className="font-medium text-brand-dark underline" href={`tel:${agent.phone}`}>{agent.phone}</a></p>}
          <p className="text-sm text-ink-soft">When the agent arrives, they will show you a 4 digit code on their phone. Enter it here so we know it is really them.</p>
          <ArrivalCodeForm orderId={id} />
        </section>
      )}

      {o.status === "agent_arrived" && <section className="card p-5 text-sm text-ink-soft">Your agent is counting your clothes by category. Your bill will appear here in a moment. Please do not hand over any cash.</section>}

      {["counted", "count_confirmed", "received", "in_house", "ready", "out_for_delivery", "delivered", "closed", "failed_delivery"].includes(o.status) && (lines ?? []).length > 0 && (
        <section className="card p-5" aria-label="Your bill">
          <h2 className="text-lg font-semibold">{o.status === "counted" ? "Your bill" : "Your clothes"}</h2>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-mute"><th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Each</th><th className="py-1 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-line">
              {(lines ?? []).map((l) => <tr key={l.id}><td className="py-2">{l.name}<span className="block text-xs text-ink-mute">{l.category_name}</span></td><td className="py-2 text-right">{l.qty}</td><td className="py-2 text-right">{naira(l.unit_price_kobo)}</td><td className="py-2 text-right">{naira(l.line_total_kobo ?? 0)}</td></tr>)}
            </tbody>
            <tfoot><tr className="font-semibold"><td className="pt-3" colSpan={3}>Total</td><td className="pt-3 text-right">{naira(due)}</td></tr></tfoot>
          </table>
          {o.status === "counted" && (
            <div className="mt-5 space-y-3 border-t border-line pt-5">
              <p className="text-sm text-ink-soft">Check this against your clothes. If it is wrong, tell your agent before you pay.</p>
              <PayButtons orderId={id} purpose="items" label={`Pay ${naira(due)}`} />
            </div>
          )}
          {o.status === "count_confirmed" && topUp === 0 && <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Paid. Your agent is taking your clothes to our hub, where they are checked again.</p>}
          {o.status === "count_confirmed" && topUp > 0 && (
            <div className="mt-5 space-y-3 border-t border-line pt-5">
              <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">When we checked your clothes, one item was in a higher-priced category than first counted. The prices above are now corrected. Please pay the difference of <strong>{naira(topUp)}</strong>.</p>
              <PayButtons orderId={id} purpose="items" label={`Pay ${naira(topUp)}`} />
            </div>
          )}
        </section>
      )}

      {o.status === "received" && <section className="card p-5 text-sm text-ink-soft">We have checked your clothes at our hub. Washing starts shortly.</section>}
      {o.status === "in_house" && <section className="card p-5 text-sm text-ink-soft">Your clothes are being washed. We will tell you the moment they are ready.</section>}
      {o.status === "ready" && (
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold">Your clothes are ready</h2>
          <p className="text-sm text-ink-soft">Pay the delivery fare of <strong>{naira(o.delivery_fare_kobo)}</strong> here and we will bring them to you. Never pay the delivery agent in cash.</p>
          <PayButtons orderId={id} purpose="delivery_fare" label={`Pay ${naira(o.delivery_fare_kobo)}`} />
        </section>
      )}
      {o.status === "out_for_delivery" && (
        <section className="card space-y-4 p-5">
          {o.delivery_agent_id ? (
            <>
              <h2 className="text-lg font-semibold">Your delivery agent{agent?.full_name ? `, ${agent.full_name},` : ""} is on the way</h2>
              {agent?.phone && <p className="text-sm">Call: <a className="font-medium text-brand-dark underline" href={`tel:${agent.phone}`}>{agent.phone}</a></p>}
              <p className="text-sm text-ink-soft">When your agent arrives, they will show you a 4 digit code. Enter it here to confirm you have your clothes.</p>
              <ArrivalCodeForm orderId={id} step="delivery" button="Confirm delivery" />
            </>
          ) : <p className="text-sm text-ink-soft">Delivery fare received. We are assigning your delivery agent and will tell you when they set off.</p>}
        </section>
      )}
      {o.status === "delivered" && <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-900"><h2 className="text-lg font-semibold">Delivered. Thank you</h2><p className="mt-1 text-sm">We hope you love your fresh clothes. <Link href="/request" className="underline">Book your next pickup</Link>.</p></section>}
      {o.status === "failed_delivery" && <section className="rounded-xl border border-red-300 bg-red-50 p-5 text-red-900"><h2 className="text-lg font-semibold">We could not deliver your clothes</h2><p className="mt-1 text-sm">We will call you to arrange another delivery. Storage charges may apply if the clothes stay with us longer than our grace period.</p></section>}

      {o.pickup_address && <p className="text-sm text-ink-soft">Pickup: {o.pickup_address} {map && <a className="underline" target="_blank" rel="noopener noreferrer" href={map}>(map)</a>}</p>}
      {timeline && timeline.steps.length > 0 && <OrderTimeline t={timeline} />}
    </main>
  );
}
