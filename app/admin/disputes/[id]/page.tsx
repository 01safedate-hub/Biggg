import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import { DisputeActions } from "@/components/admin/DisputeForms";
import { PrintButton } from "@/components/orders/PrintButton";

export const metadata = { title: "Dispute evidence" };
export const dynamic = "force-dynamic";

type Ev = {
  dispute: { id: string; provider: string; external_ref: string | null; amount_kobo: number; reason: string; status: string; due_at: string | null; evidence_note: string | null; evidence_sent_at: string | null; resolution_note: string | null; resolved_at: string | null; created_at: string };
  payment: { reference: string; mode: string; purpose: string; amount_kobo: number; paid_at: string | null };
  order: { order_no: number; source: string; status: string; created_at: string; address: string | null; delivered_at: string | null; items_total_kobo: number; discount_kobo: number };
  customer: { name: string; email: string | null; phone: string | null; member_since: string; earlier_orders: number } | null;
  items: { name: string; qty: number; line_total_kobo: number }[];
  timeline: { at: string; event: string; detail: Record<string, unknown> | null }[];
  codes: { step: string; verified_at: string | null; issued_at: string }[];
  delivery_attempts: { at: string; outcome: string; note: string | null }[];
  calls: { at: string; outcome: string; note: string | null }[];
  rating: { stars: number; comment: string | null } | null;
  issues: { kind: string; status: string; description: string }[];
};
const dt = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "not yet");
const LABEL: Record<string, string> = { open: "Needs your reply", evidence_sent: "Waiting for the bank", won: "Won", lost: "Lost" };

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.rpc("dispute_evidence", { _id: id });
  if (error || !data) notFound();
  const e = data as unknown as Ev;
  const d = e.dispute;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between print:hidden"><Link href="/admin/disputes" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Bank disputes</Link><PrintButton /></div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dispute on order #{e.order.order_no}</h1>
        <p className="mt-1 text-sm text-ink-soft"><strong>{LABEL[d.status]}</strong> · {naira(d.amount_kobo)} via {d.provider} · opened {dt(d.created_at)}{d.due_at ? ` · reply by ${dt(d.due_at)}` : ""}</p>
        <p className="mt-1 text-sm">Reason given: {d.reason}</p>
        {d.evidence_note && <p className="mt-1 text-sm text-ink-soft">Evidence sent {dt(d.evidence_sent_at)}: {d.evidence_note}</p>}
        {d.resolution_note && <p className="mt-1 text-sm text-ink-soft">Settled {dt(d.resolved_at)}: {d.resolution_note}</p>}
      </div>
      <DisputeActions id={id} status={d.status} />

      <section className="card space-y-2 p-5 text-sm">
        <h2 className="text-lg font-semibold">Evidence pack</h2>
        <p className="text-ink-soft">Everything below is recorded automatically as the order moves. Print this page or save it as a PDF and attach it to your reply to the bank.</p>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <div><dt className="inline text-ink-soft">Customer: </dt><dd className="inline">{e.customer?.name}</dd></div>
          <div><dt className="inline text-ink-soft">Email: </dt><dd className="inline">{e.customer?.email ?? "none"}</dd></div>
          <div><dt className="inline text-ink-soft">Phone: </dt><dd className="inline">{e.customer?.phone ?? "none"}</dd></div>
          <div><dt className="inline text-ink-soft">Customer since: </dt><dd className="inline">{e.customer ? dt(e.customer.member_since) : ""} ({e.customer?.earlier_orders ?? 0} earlier completed orders)</dd></div>
          <div><dt className="inline text-ink-soft">Payment reference: </dt><dd className="inline font-mono">{e.payment.reference}</dd></div>
          <div><dt className="inline text-ink-soft">Paid: </dt><dd className="inline">{naira(e.payment.amount_kobo)} on {dt(e.payment.paid_at)} ({e.payment.purpose.replace("_", " ")})</dd></div>
          <div><dt className="inline text-ink-soft">Order status: </dt><dd className="inline">{STATUS_LABEL[e.order.status] ?? e.order.status}</dd></div>
          <div><dt className="inline text-ink-soft">Delivered: </dt><dd className="inline">{dt(e.order.delivered_at)}</dd></div>
          <div className="sm:col-span-2"><dt className="inline text-ink-soft">Pickup address: </dt><dd className="inline">{e.order.address ?? "not recorded"}</dd></div>
        </dl>
      </section>

      <section className="card p-5 text-sm">
        <h3 className="font-semibold">Clothes</h3>
        <ul className="mt-2 divide-y divide-line">{e.items.map((i, k) => <li key={k} className="flex justify-between py-1.5"><span>{i.qty} × {i.name}</span><span>{naira(i.line_total_kobo)}</span></li>)}{e.items.length === 0 && <li className="py-1.5 text-ink-soft">No items recorded.</li>}</ul>
      </section>

      <section className="card p-5 text-sm">
        <h3 className="font-semibold">Proof the customer was present</h3>
        <ul className="mt-2 space-y-1">
          {e.codes.map((c, k) => <li key={k}>{c.step === "arrival" ? "Pickup" : "Delivery"} code shown {dt(c.issued_at)} · customer entered it: <strong>{c.verified_at ? dt(c.verified_at) : "no"}</strong></li>)}
          {e.codes.length === 0 && <li className="text-ink-soft">No codes (for example a walk-in order).</li>}
          {e.rating && <li>Customer rated the order {e.rating.stars} of 5{e.rating.comment ? `: "${e.rating.comment}"` : ""}</li>}
          {e.issues.map((s, k) => <li key={k}>Problem report ({s.kind.replace("_", " ")}, {s.status}): {s.description}</li>)}
        </ul>
      </section>

      <section className="card p-5 text-sm">
        <h3 className="font-semibold">Timeline</h3>
        <ul className="mt-2 space-y-1">
          {e.timeline.map((t, k) => <li key={k}><span className="text-ink-mute">{dt(t.at)}</span> · {t.event.replace(/_/g, " ")}</li>)}
          {e.delivery_attempts.map((t, k) => <li key={`a${k}`}><span className="text-ink-mute">{dt(t.at)}</span> · delivery attempt: {t.outcome}{t.note ? ` (${t.note})` : ""}</li>)}
          {e.calls.map((t, k) => <li key={`c${k}`}><span className="text-ink-mute">{dt(t.at)}</span> · call to customer: {t.outcome.replace("_", " ")}{t.note ? ` (${t.note})` : ""}</li>)}
          {e.timeline.length === 0 && <li className="text-ink-soft">No events.</li>}
        </ul>
      </section>
    </div>
  );
}
