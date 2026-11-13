import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { QuoteAccept } from "@/components/cleaning/QuoteAccept";
import { PayInvoice } from "@/components/cleaning/shared";
import { CLEANING_HOTLINE, CLEANING_WHATSAPP, QUOTE_STATUS_LABEL, SERVICE_LABEL, dateTimeLabel, minutesLabel, nairaK } from "@/lib/cleaning";

export const metadata: Metadata = { title: "Your cleaning quote", robots: { index: false } };
export const dynamic = "force-dynamic";

type Line = { kind: string; label: string; qty: number; unit_kobo: number; amount_kobo: number };
type Q = {
  quote: {
    id: string; quote_no: number; kind: "one_off" | "plan"; service: string; condition: string; status: string; valid_until: string | null;
    lines: Line[] | { regular: Line[]; deep: Line[] }; subtotal_kobo: number; transport_kobo: number; transport_waived_kobo: number; override_kobo: number | null;
    visit_price_kobo: number; crew_size: number; duration_min: number; visits_per_month: number | null; plan_discount_pct: number | null; bundle: boolean;
    monthly_kobo: number | null; first_deep_kobo: number | null; deep_duration_min: number | null; exclusions: string | null; notes: string | null;
  };
  property: { address: string; kind: string; zone_id: string | null };
  plan: { name: string; blurb: string | null; deep_every_months: number | null } | null;
  total_kobo: number; credit_kobo: number; deposit_allowed: boolean; deposit_pct: number; term_discounts: Record<string, number>;
  first_visit: { crew_size: number; duration_min: number };
  open_invoice: { id: string; amount_kobo: number } | null;
};

function Lines({ lines }: { lines: Line[] }) {
  return (
    <ul className="divide-y divide-line text-sm">
      {lines.map((l, i) => <li key={i} className="flex justify-between gap-3 py-1.5"><span>{l.label}{l.qty > 1 ? ` × ${l.qty}` : ""}</span><span>{nairaK(l.amount_kobo)}</span></li>)}
    </ul>
  );
}

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireUser(`/cleaning/quote/${id}`);
  const { data, error } = await supabase.rpc("cleaning_quote_for_customer" as never, { _quote: id } as never);
  if (error || !data) notFound();
  const d = data as unknown as Q;
  const q = d.quote;
  const plan = q.kind === "plan";
  const regular = Array.isArray(q.lines) ? q.lines : q.lines.regular ?? [];
  const deep = Array.isArray(q.lines) ? [] : q.lines.deep ?? [];
  const open = q.status === "sent";

  return (
    <main id="main" className="min-h-screen w-full">
      <CustomerSidebar />
      <div className="container-page mx-auto max-w-2xl space-y-6 py-6 sm:py-8">
        <div className="space-y-1">
          <p className="text-sm text-ink-mute">Quote #{q.quote_no}</p>
          <h1 className="text-3xl font-bold tracking-tight">{plan ? `${d.plan?.name ?? "Cleaning"} plan` : SERVICE_LABEL[q.service] ?? "Cleaning"}</h1>
          <p className="text-sm text-ink-soft">{d.property.address}</p>
          {!open && <p className="rounded-md border border-line bg-canvas p-3 text-sm">This quote is <strong>{(QUOTE_STATUS_LABEL[q.status] ?? q.status).toLowerCase()}</strong>. {q.status === "expired" ? <>Ask us for a fresh one: call {CLEANING_HOTLINE} or <a className="underline" href={CLEANING_WHATSAPP}>WhatsApp</a>.</> : q.status === "accepted" ? <Link className="underline" href="/cleaning/my">See your bookings</Link> : null}</p>}
        </div>

        <section className="card space-y-4 p-5">
          {plan ? (
            <>
              <div>
                <h2 className="font-semibold">Each regular visit ({SERVICE_LABEL[q.service] ?? q.service})</h2>
                <Lines lines={regular} />
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt>Visits per month</dt><dd>{q.visits_per_month}</dd></div>
                {d.plan?.deep_every_months ? <div className="flex justify-between"><dt>Deep clean</dt><dd>every {d.plan.deep_every_months} months</dd></div> : null}
                {Number(q.plan_discount_pct ?? 0) > 0 && <div className="flex justify-between"><dt>Plan saving</dt><dd>{q.plan_discount_pct}% off</dd></div>}
                {q.bundle && <div className="flex justify-between text-emerald-800"><dt>Home Complete</dt><dd>Free laundry pickup and delivery included</dd></div>}
                <div className="flex justify-between"><dt>Crew transport per visit</dt><dd>{q.transport_kobo === 0 ? "Free" : nairaK(q.transport_kobo)}</dd></div>
                <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Monthly price</dt><dd>{nairaK(q.monthly_kobo)}</dd></div>
              </dl>
              <div>
                <h2 className="font-semibold">First visit: deep clean</h2>
                <p className="text-xs text-ink-mute">We start every plan with a deep clean so regular visits keep it that way.</p>
                <Lines lines={deep} />
                <p className="mt-1 flex justify-between text-sm font-semibold"><span>First deep clean (with transport)</span><span>{nairaK(q.first_deep_kobo)}</span></p>
              </div>
            </>
          ) : (
            <>
              <Lines lines={regular} />
              <dl className="space-y-1 text-sm">
                {q.override_kobo ? <div className="flex justify-between"><dt>Agreed cleaning price</dt><dd>{nairaK(q.override_kobo)}</dd></div> : <div className="flex justify-between"><dt>Cleaning</dt><dd>{nairaK(q.subtotal_kobo)}</dd></div>}
                <div className="flex justify-between"><dt>Crew transport</dt><dd>{q.transport_kobo === 0 ? "Free" : nairaK(q.transport_kobo)}</dd></div>
                <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Total</dt><dd>{nairaK(q.visit_price_kobo)}</dd></div>
              </dl>
            </>
          )}
          <p className="text-sm text-ink-soft">Crew of {d.first_visit.crew_size}, about {minutesLabel(d.first_visit.duration_min)} on site. We bring our own cleaning supplies and tools. Please make sure water is available.</p>
          {d.credit_kobo > 0 && <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-900">Your inspection fee of {nairaK(d.credit_kobo)} is taken off what you pay.</p>}
          {q.exclusions && <p className="text-sm"><strong>Not included:</strong> {q.exclusions}</p>}
          {q.notes && <p className="text-sm"><strong>Notes:</strong> {q.notes}</p>}
          {open && q.valid_until && <p className="text-xs text-ink-mute">Valid until {dateTimeLabel(q.valid_until)}.</p>}
        </section>

        {open && d.open_invoice && (
          <section className="card space-y-2 p-5">
            <h2 className="font-semibold">Finish your payment</h2>
            <p className="text-sm text-ink-soft">You already chose a time. Pay {nairaK(d.open_invoice.amount_kobo)} to confirm it, or choose again below if the hold has expired.</p>
            <PayInvoice invoiceId={d.open_invoice.id} label={`Pay ${nairaK(d.open_invoice.amount_kobo)}`} />
          </section>
        )}
        {open && (
          <QuoteAccept quoteId={q.id} kind={q.kind} zoneId={d.property.zone_id} crew={d.first_visit.crew_size} duration={d.first_visit.duration_min}
            visitPriceKobo={q.visit_price_kobo} monthlyKobo={Number(q.monthly_kobo ?? 0)} firstDeepKobo={Number(q.first_deep_kobo ?? 0)} creditKobo={d.credit_kobo}
            depositAllowed={d.deposit_allowed} depositPct={d.deposit_pct} termDiscounts={d.term_discounts ?? {}} />
        )}
        <p className="text-xs text-ink-mute">You can move a visit to another day up to 24 hours before, at no cost. If anything is missed, tell us within 24 hours with a photo and we come back to fix it free.</p>
      </div>
    </main>
  );
}
