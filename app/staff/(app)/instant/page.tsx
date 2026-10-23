import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { STATUS_LABEL } from "@/lib/orders";
import { TimeLeft } from "@/components/ops/TimeLeft";
import { AutoRefresh } from "@/components/orders/AutoRefresh";

export const metadata = { title: "Instant orders" };
export const dynamic = "force-dynamic";

type B = { id: string; order_no: number; status: string; customer: string; phone: string | null; items: number | null; started_at: string; target_at: string; promise_at: string; large: boolean; delivery_agent: string | null };
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit" });
const NEXT: Record<string, string> = { count_confirmed: "Agent is bringing it to the hub: receive it", received: "Start washing", in_house: "Finish washing and mark ready", ready: "Send it out for delivery", out_for_delivery: "With the delivery agent", failed_delivery: "Delivery failed: call the customer" };

export default async function InstantBoard() {
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { data } = await supabase.rpc("instant_board");
  const rows = (Array.isArray(data) ? data : []) as unknown as B[];
  const late = rows.filter((r) => new Date(r.target_at).getTime() < Date.now()).length;
  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      <div><h1 className="text-2xl font-bold tracking-tight">Instant orders</h1><p className="mt-1 text-sm text-ink-soft">Customers who paid extra to get their clothes back within the target. Most urgent first. {rows.length === 0 ? "None running now." : `${rows.length} running${late ? `, ${late} past the target` : ""}.`}</p></div>
      <div className="card divide-y divide-line">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-medium">Order #{r.order_no} · {r.customer} <TimeLeft targetAt={r.target_at} promiseAt={r.promise_at} label={false} /></p>
              <p className="text-sm text-ink-soft">{r.items ?? "?"} items · paid {clock(r.started_at)} · target {clock(r.target_at)}{r.large ? ` · large load, customer told up to ${clock(r.promise_at)}` : ""}</p>
              <p className="text-sm">{STATUS_LABEL[r.status] ?? r.status}: <span className="text-ink-soft">{NEXT[r.status]}{r.delivery_agent ? ` (${r.delivery_agent})` : ""}</span></p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {r.phone && <a className="font-medium text-brand-dark underline" href={`tel:${r.phone}`}>{r.phone}</a>}
              <Link className="btn-secondary" href={r.status === "count_confirmed" || r.status === "received" ? `/staff/receiving/${r.id}` : r.status === "out_for_delivery" || r.status === "failed_delivery" ? "/staff/dispatch" : "/staff/hub"}>Open</Link>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="p-5 text-sm text-ink-soft">No instant orders are running.</p>}
      </div>
    </div>
  );
}
