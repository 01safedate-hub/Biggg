import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { STATUS_LABEL } from "@/lib/orders";
import { naira } from "@/lib/format";
import { IssueResolve, ReviewActions, WaiveButton } from "@/components/admin/AttentionForms";

export const metadata = { title: "Needs attention" };
export const dynamic = "force-dynamic";

type Ov = {
  reviews: { event_id: number; order_id: string; order_no: number; reference: string; purpose: string; order_status: string; amount_kobo: number | null; customer: string; at: string }[];
  storage: { order_id: string; order_no: number; customer: string; phone: string | null; status: string; grace_ends_at: string; accrued_kobo: number; due_kobo: number }[];
  stuck: { order_id: string; order_no: number; status: string; minutes: number }[];
  issues: { id: string; order_id: string; order_no: number; kind: string; description: string; customer: string; phone: string | null; at: string; items_paid_kobo: number }[];
  refunds: { count: number; kobo: number };
};
const dt = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dur = (m: number) => (m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`);
const KIND: Record<string, string> = { missing_item: "Missing item", damaged: "Damaged", wrong_item: "Wrong item", not_clean: "Not clean", other: "Other" };

export default async function Attention() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.rpc("attention_overview");
  const o = data as unknown as Ov | null;
  const { data: integ } = await supabase.rpc("integrity_check");
  const flags = (Array.isArray(integ) ? integ : []) as unknown as { code: string; severity: string; order_id: string; order_no: number; detail: string }[];
  if (!o) return <p className="card p-5 text-sm">Could not load this page. Please refresh.</p>;
  const total = flags.length + o.reviews.length + o.storage.length + o.stuck.length + o.issues.length + (o.refunds.count > 0 ? 1 : 0);
  const Section = ({ title, hint, n, children }: { title: string; hint: string; n: number; children: React.ReactNode }) => (
    <section className="space-y-2"><div><h2 className="text-lg font-semibold">{title} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-ink-soft">{n}</span></h2><p className="text-sm text-ink-soft">{hint}</p></div>{n > 0 ? <div className="card divide-y divide-line">{children}</div> : <p className="card p-4 text-sm text-ink-soft">Nothing here. Good.</p>}</section>
  );
  return (
    <div className="space-y-8">
      <div><h1 className="text-2xl font-bold tracking-tight">Needs attention</h1><p className="mt-1 text-sm text-ink-soft">{total === 0 ? "Everything is in order." : "Things only you can fix. Each one has a button."}</p></div>

      <Section title="Customer problems" hint="Reported after delivery. Respond and, if it is fair, refund part of the clothes bill." n={o.issues.length}>
        {o.issues.map((i) => (
          <div key={i.id} className="space-y-2 p-4"><p className="font-medium"><Link className="text-brand-dark underline" href={`/staff/orders/${i.order_id}`}>#{i.order_no}</Link> · {i.customer} · {KIND[i.kind] ?? i.kind} <span className="text-xs text-ink-mute">{dt(i.at)}</span></p>
            <p className="text-sm">{i.description}</p>{i.phone && <p className="text-sm"><a className="text-brand-dark underline" href={`tel:${i.phone}`}>{i.phone}</a></p>}
            <IssueResolve id={i.id} maxNaira={Math.floor(i.items_paid_kobo / 100)} /></div>
        ))}
      </Section>

      <Section title="Payments to review" hint="Money arrived when the order could not use it. Refund it, or keep it if you have sorted it out with the customer." n={o.reviews.length}>
        {o.reviews.map((r) => (
          <div key={r.event_id} className="space-y-2 p-4"><p className="font-medium"><Link className="text-brand-dark underline" href={`/staff/orders/${r.order_id}`}>#{r.order_no}</Link> · {r.customer} · {r.amount_kobo != null ? naira(r.amount_kobo) : ""}</p>
            <p className="text-sm text-ink-soft">Paid for “{r.purpose}” when the order was “{STATUS_LABEL[r.order_status] ?? r.order_status}”. Reference {r.reference}, {dt(r.at)}.</p><ReviewActions eventId={r.event_id} /></div>
        ))}
      </Section>

      <Section title="Storage fees running" hint="Clothes that could not be delivered. You can waive the fee for a good reason." n={o.storage.length}>
        {o.storage.map((s) => (
          <div key={s.order_id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium"><Link className="text-brand-dark underline" href={`/staff/orders/${s.order_id}`}>#{s.order_no}</Link> · {s.customer}{s.phone && <> · <a className="text-brand-dark underline" href={`tel:${s.phone}`}>{s.phone}</a></>}</p>
            <p className="text-sm text-ink-soft">{s.status === "grace" ? `Free until ${dt(s.grace_ends_at)}` : `Fee due ${naira(s.due_kobo)} (${naira(s.accrued_kobo)} built up)`}</p></div><WaiveButton orderId={s.order_id} /></div>
        ))}
      </Section>

      <Section title="Orders that look stuck" hint="Waiting longer than expected. Open the order to see who has it." n={o.stuck.length}>
        {o.stuck.map((s) => <Link key={s.order_id} href={`/staff/orders/${s.order_id}`} className="flex justify-between gap-2 p-4 text-sm hover:bg-canvas"><span className="font-medium">#{s.order_no} · {STATUS_LABEL[s.status] ?? s.status}</span><span className="text-red-700">waiting {dur(s.minutes)}</span></Link>)}
      </Section>

      <Section title="Books that do not add up" hint="An automatic check of money against orders. Each line is a real mismatch to look into." n={flags.length}>
        {flags.map((f, i) => <Link key={`${f.order_id}-${f.code}-${i}`} href={`/staff/orders/${f.order_id}`} className="block p-4 text-sm hover:bg-canvas"><span className="font-medium">#{f.order_no}</span> <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${f.severity === "1" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{f.severity === "1" ? "Money" : "Check"}</span><span className="block text-ink-soft">{f.detail}</span></Link>)}
      </Section>

      {o.refunds.count > 0 && <p className="card p-4 text-sm"><strong>{o.refunds.count}</strong> refund{o.refunds.count === 1 ? "" : "s"} to send, {naira(o.refunds.kobo)} in all. <Link className="text-brand-dark underline" href="/admin/payments">Go to Online payments</Link>.</p>}
    </div>
  );
}
