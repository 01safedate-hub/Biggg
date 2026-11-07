import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { STATUS_LABEL, mapsLink } from "@/lib/orders";
import { ONLINE_DONE, ONLINE_SOURCES, ONLINE_STAGES, prepaidReturnCovers } from "@/lib/online-orders";
import { PhoneActions } from "@/components/ops/PhoneActions";
import { AutoRefresh } from "@/components/orders/AutoRefresh";

export const metadata = { title: "Online orders" };
export const dynamic = "force-dynamic";

type Row = {
  id: string; order_no: number; status: string; source: string; customer_id: string; created_at: string; updated_at: string;
  pickup_address: string | null; pickup_fare_kobo: number; delivery_fare_kobo: number | null; return_prepaid_kobo: number | null;
  fulfillment_choice: string | null; return_delivery_address: string | null; return_delivery_lat: number | null; return_delivery_lng: number | null;
  delivery_agent_id: string | null; pickup_agent_id: string | null;
};

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`;
};

/** What staff should do next with a ready online order. */
function returnNote(o: Row, extraPaid: boolean): { text: string; tone: "ok" | "wait" | "info"; href?: string; cta?: string } {
  if (o.status === "awaiting_delivery_fare") {
    return { text: `Customer chose a further address. Waiting for them to pay the extra ${naira(Number(o.delivery_fare_kobo ?? 0))} online. Do not collect cash.`, tone: "wait" };
  }
  if (o.fulfillment_choice === "collect") return { text: "Customer will collect from the hub. No delivery needed.", tone: "info" };
  if (prepaidReturnCovers(o) || extraPaid) return { text: "Return paid. Assign a rider in Dispatch.", tone: "ok", href: "/staff/dispatch", cta: "Assign rider" };
  return { text: "Customer has not chosen delivery or collection yet.", tone: "info" };
}

export default async function OnlineOrdersPage() {
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { data } = await supabase.from("orders")
    .select("id,order_no,status,source,customer_id,created_at,updated_at,pickup_address,pickup_fare_kobo,delivery_fare_kobo,return_prepaid_kobo,fulfillment_choice,return_delivery_address,return_delivery_lat,return_delivery_lng,delivery_agent_id,pickup_agent_id")
    .in("source", [...ONLINE_SOURCES])
    .not("status", "in", `(${ONLINE_DONE.join(",")})`)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as unknown as Row[];

  const customerIds = Array.from(new Set(rows.map((r) => r.customer_id)));
  const readyIds = rows.filter((r) => r.status === "ready").map((r) => r.id);
  const [{ data: people }, { data: extraPaidRows }] = await Promise.all([
    customerIds.length ? supabase.from("profiles").select("id,full_name,phone").in("id", customerIds) : Promise.resolve({ data: [] }),
    readyIds.length
      ? supabase.from("payments").select("order_id").in("order_id", readyIds).eq("purpose", "delivery_fare").eq("kind", "payment").eq("status", "success")
      : Promise.resolve({ data: [] }),
  ]);
  const who = new Map((people ?? []).map((p) => [p.id, p]));
  const extraPaid = new Set((extraPaidRows ?? []).map((p) => p.order_id));

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Online orders</h1>
        <p className="mt-1 text-sm text-ink-soft">Orders customers booked and paid for online, from pickup to delivery.</p>
      </div>
      <p role="note" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
        <strong>Pickup and return are paid once, at booking.</strong> Never ask an online customer for a delivery fee. The only exception is when they choose a further
        address than they booked; the app then asks them for the difference online. Walk-in delivery fees are handled on the Walk-in tab.
      </p>

      <nav aria-label="Stages" className="flex flex-wrap gap-2 text-sm">
        {ONLINE_STAGES.map((s) => {
          const n = rows.filter((r) => s.statuses.includes(r.status)).length;
          return <a key={s.key} href={`#${s.key}`} className={`rounded-full border px-3 py-1 ${n ? "border-brand bg-brand-tint text-brand-dark" : "border-line text-ink-soft"}`}><strong>{n}</strong> {s.label}</a>;
        })}
      </nav>

      {ONLINE_STAGES.map((stage) => {
        const list = rows.filter((r) => stage.statuses.includes(r.status));
        return (
          <section key={stage.key} id={stage.key} className="space-y-3" aria-label={stage.label}>
            <div>
              <h2 className="text-xl font-bold tracking-tight">{stage.label} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-sm font-medium text-ink-soft">{list.length}</span></h2>
              <p className="text-sm text-ink-soft">{stage.hint}</p>
            </div>
            {list.length === 0 && <p className="card p-4 text-sm text-ink-soft">Nothing here.</p>}
            {list.map((o) => {
              const c = who.get(o.customer_id);
              const prepaid = Number(o.return_prepaid_kobo ?? 0);
              const to = o.return_delivery_address ?? o.pickup_address;
              const map = mapsLink(o.return_delivery_lat, o.return_delivery_lng);
              const note = stage.key === "return" ? returnNote(o, extraPaid.has(o.id)) : null;
              return (
                <article key={o.id} className="card space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">Order #{o.order_no} · {c?.full_name ?? "Customer"}</p>
                      <p className="text-sm text-ink-soft">{STATUS_LABEL[o.status] ?? o.status} · updated {ago(o.updated_at)} ago</p>
                      <p className="text-sm text-ink-soft">{stage.key === "return" || stage.key === "delivery" ? `To: ${to ?? "No address"}` : `From: ${o.pickup_address ?? "No address"}`} {map && (stage.key === "return" || stage.key === "delivery") && <a className="underline" target="_blank" rel="noopener noreferrer" href={map}>map</a>} <PhoneActions phone={c?.phone} /></p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900">
                      {prepaid > 0 ? `Transport paid at booking · return ${naira(prepaid)}` : o.source === "online" ? "Older online booking" : "Pickup paid"}
                    </span>
                  </div>
                  {note && (
                    <p className={`rounded-md p-2 text-sm ${note.tone === "ok" ? "bg-emerald-50 text-emerald-950" : note.tone === "wait" ? "bg-amber-50 text-amber-950" : "bg-slate-50 text-ink-soft"}`}>
                      {note.text} {note.href && <Link href={note.href} className="font-semibold underline">{note.cta}</Link>}
                    </p>
                  )}
                  {stage.key === "delivery" && (
                    <p className="text-sm text-ink-soft">{o.status === "failed_delivery" ? "Delivery failed. Call the customer from Dispatch." : o.delivery_agent_id ? "With a rider." : "Needs a rider."} <Link href="/staff/dispatch" className="font-semibold underline">Open Dispatch</Link></p>
                  )}
                  <Link href={`/staff/orders/${o.id}`} className="inline-block text-sm font-medium text-brand-dark hover:underline">Order timeline &rarr;</Link>
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
