import { TimeLeft } from "@/components/ops/TimeLeft";
import { requireRole } from "@/lib/roles";
import { HubButton } from "@/components/ops/DeskTools";
import { STATUS_LABEL } from "@/lib/orders";
import { PhoneActions } from "@/components/ops/PhoneActions";
import Link from "next/link";

export const metadata = { title: "Wash queue" };
export const dynamic = "force-dynamic";

const ago = (iso: string | null) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;
};

export default async function HubPage() {
  const { supabase,roles } = await requireRole(["secretary", "admin", "super_admin", "washer"]);
  const washerOnly=roles.includes("washer")&&!roles.some(r=>["super_admin","admin","secretary"].includes(r));
  const { data } = await supabase.from("orders").select("id,order_no,source,status,customer_id,zone_id,updated_at,ready_at,items_total_kobo,instant,instant_target_at,instant_promise_at").in("status", washerOnly ? ["received", "in_house"] : ["received", "in_house", "ready"]).order("instant", { ascending: false }).order("instant_target_at", { ascending: true, nullsFirst: false }).order("updated_at");
  const ids = Array.from(new Set((data ?? []).map((o) => o.customer_id)));
  const zoneIds = Array.from(new Set((data ?? []).map((o) => o.zone_id).filter((id): id is string => typeof id === "string")));
  const { data: zones } = zoneIds.length ? await supabase.from("zones").select("id,name").in("id", zoneIds) : { data: [] };
  const zoneNames = new Map((zones ?? []).map((z) => [z.id, z.name]));
  const { data: ppl } = !washerOnly&&ids.length ? await supabase.from("profiles").select("id,full_name,phone").in("id", ids) : { data: [] };
  const who = new Map((ppl ?? []).map((p) => [p.id, p]));
  const { data: counts } = (data ?? []).length ? await supabase.from("order_items").select("order_id,qty").in("order_id", (data ?? []).map((o) => o.id)).is("removed_at", null) : { data: [] };
  const pieces = new Map<string, number>();
  for (const c of counts ?? []) pieces.set(c.order_id, (pieces.get(c.order_id) ?? 0) + c.qty);
  const { data: board } = await supabase.rpc("shelf_board");
  const shelfRows = (board ?? []) as unknown as { shelf: string; order_id: string }[];
  const shelfUse: Record<string, number> = {};
  const shelvesOf = new Map<string, string[]>();
  for (const b of shelfRows) { shelfUse[b.shelf] = (shelfUse[b.shelf] ?? 0) + 1; shelvesOf.set(b.order_id, [...(shelvesOf.get(b.order_id) ?? []), b.shelf]); }
  const col = (status: string, title: string, hint: string, action?: { step: "wash" | "ready"; label: string }) => {
    const rows = (data ?? []).filter((o) => o.status === status);
    return (
      <section>
        <h2 className="mb-1 text-lg font-semibold">{title} ({rows.length})</h2><p className="mb-2 text-sm text-ink-soft">{hint}</p>
        <div className="card divide-y divide-line">
          {rows.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div><p className="font-medium">Order #{o.order_no} {(!washerOnly&&who.get(o.customer_id)?.full_name) ? `· ${who.get(o.customer_id)?.full_name}` : null} {o.instant && o.instant_target_at && <TimeLeft targetAt={o.instant_target_at} promiseAt={o.instant_promise_at} />}</p><p className="text-sm text-ink-soft">{shelvesOf.get(o.id) && <strong className="text-ink">Shelf {shelvesOf.get(o.id)!.join(", ")} · </strong>}{pieces.get(o.id) ?? 0} pieces · here for {ago(o.ready_at ?? o.updated_at)}{o.status === "ready" && !washerOnly && <> · <PhoneActions phone={who.get(o.customer_id)?.phone} message={`Hello ${(who.get(o.customer_id)?.full_name ?? "").split(" ")[0]}, your clothes (order #${o.order_no}) are ready at LaundryPoint. Please come to collect them, or tell us if you want them delivered.`} /></>}</p></div>
              {action ? <HubButton orderId={o.id} step={action.step} label={action.label} shelfUse={shelfUse} /> : <div className="text-right"><p className="text-xs font-medium text-amber-700">{STATUS_LABEL[o.status]}</p>{!washerOnly&&(o.source === "walk_in" || o.source === "one_time") && <Link href={`/staff/walkin/${o.id}`} className="text-xs underline">Open / arrange delivery</Link>}</div>}
            </div>
          ))}
          {rows.length === 0 && <p className="p-5 text-sm text-ink-soft">Nothing here.</p>}
        </div>
      </section>
    );
  };
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Wash queue</h1><p className="mt-1 text-sm text-ink-soft"><Link href="/staff/shelves" className="font-medium underline">Shelf map</Link> · {washerOnly ? "Only received orders can be started. Only orders being washed can be marked ready." : "Move each order forward as the clothes are washed. When you mark one ready, the customer is asked to pay the delivery fare."}</p></div>
      {col("received", "Received, not started", "Checked in at the hub.", { step: "wash", label: "Start washing" })}
      {col("in_house", "Being washed", "Mark ready once folded and packed, and say which shelf they are on.", { step: "ready", label: "Mark ready" })}
      {!washerOnly&&col("ready", "Ready, waiting for the customer", "The customer has been asked to pay for delivery. Call them if it stays here for long.")}
    </div>
  );
}
