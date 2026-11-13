import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { PayInvoice, VerifyCleaningPayment } from "@/components/cleaning/shared";
import { BookCredit, ExtraDecision, PlanControls, RateVisit, RescheduleVisit } from "@/components/cleaning/MyCleaningWidgets";
import {
  CLEANING_HOTLINE, CLEANING_TEL, CLEANING_WHATSAPP, INVOICE_PURPOSE_LABEL, PLAN_STATUS_LABEL, QUOTE_STATUS_LABEL, REQUEST_STATUS_LABEL, SERVICE_LABEL,
  TERM_LABEL, VISIT_KIND_LABEL, VISIT_STATUS_LABEL, WEEKDAY_LABEL, dateTimeLabel, dayLabel, nairaK,
} from "@/lib/cleaning";

export const metadata: Metadata = { title: "My cleaning", robots: { index: false } };
export const dynamic = "force-dynamic";

type Line = { label: string; qty: number; amount_kobo: number };
type My = {
  requests: { id: string; request_no: number; service: string; status: string; created_at: string; address: string | null;
    inspection: { id: string; mode: string; scheduled_for: string | null; status: string; fee_kobo: number; fee_paid: boolean; invoice_id: string | null } | null }[];
  quotes: { id: string; quote_no: number; kind: string; status: string; total_kobo: number; valid_until: string | null }[];
  visits: { id: string; visit_no: number; kind: string; service: string; date: string; window: string; start_time: string | null; status: string; address: string;
    arrival_code: string | null; completion_code: string | null; rating: number | null; balance_due_kobo: number; finished_at: string | null; crew: string[] | null;
    extras: { id: string; amount_kobo: number; lines: Line[]; status: string }[] | null; can_reschedule: boolean; can_complain: boolean }[];
  plans: { id: string; status: string; plan: string | null; monthly_kobo: number; visits_per_month: number; weekday: number; window: string; term: string;
    period_end: string | null; cancel_at_period_end: boolean; paused_from: string | null; paused_until: string | null; bundle: boolean; address: string; credits: number }[];
  invoices: { id: string; purpose: string; amount_kobo: number; description: string; created_at: string }[];
  credits: { id: string; reason: string; expires_on: string; subscription_id: string }[];
};

const ACTIVE = ["scheduled", "on_the_way", "in_progress", "awaiting_signoff"];

export default async function MyCleaningPage({ searchParams }: { searchParams: Promise<{ returning?: string; ref?: string; requested?: string; booked?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/cleaning/my");
  const { data, error } = await supabase.rpc("my_cleaning" as never);
  const d = (data ?? null) as unknown as My | null;
  const upcoming = (d?.visits ?? []).filter((v) => ACTIVE.includes(v.status));
  const past = (d?.visits ?? []).filter((v) => !ACTIVE.includes(v.status)).reverse();
  const openQuotes = (d?.quotes ?? []).filter((q) => q.status === "sent");
  const nothing = d && !d.requests.length && !d.quotes.length && !d.visits.length && !d.plans.length && !d.invoices.length;

  return (
    <main id="main" className="min-h-screen w-full">
      <CustomerSidebar />
      <div className="container-page mx-auto max-w-3xl space-y-6 py-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My cleaning</h1>
            <p className="text-sm text-ink-soft">Questions? <a className="underline" href={`tel:${CLEANING_TEL}`}>Call {CLEANING_HOTLINE}</a> or <a className="underline" href={CLEANING_WHATSAPP}>WhatsApp</a>.</p>
          </div>
          <Link href="/cleaning/request" className="btn-primary">Request a clean</Link>
        </div>

        {sp.returning === "1" && sp.ref && <VerifyCleaningPayment reference={sp.ref} />}
        {sp.requested && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Request #{sp.requested} received. We will call you shortly to arrange your quote.</p>}
        {sp.booked && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">You are booked. Your arrival code is below.</p>}
        {error && <p className="card p-5 text-sm text-ink-soft">We could not load your cleaning right now. Please refresh in a moment.</p>}
        {nothing && (
          <section className="card space-y-2 p-5">
            <h2 className="font-semibold">No cleaning yet</h2>
            <p className="text-sm text-ink-soft">Book a one-off clean, a deep clean, or a monthly plan. See <Link className="underline" href="/cleaning">prices and services</Link>.</p>
          </section>
        )}

        {(d?.invoices.length ?? 0) > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">To pay</h2>
            {d!.invoices.map((i) => (
              <div key={i.id} className="card space-y-2 p-4">
                <div className="flex justify-between gap-3"><p className="font-medium">{INVOICE_PURPOSE_LABEL[i.purpose] ?? "Bill"}</p><p className="font-bold">{nairaK(i.amount_kobo)}</p></div>
                <p className="text-sm text-ink-soft">{i.description}</p>
                <PayInvoice invoiceId={i.id} label={`Pay ${nairaK(i.amount_kobo)}`} />
              </div>
            ))}
          </section>
        )}

        {openQuotes.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Quotes waiting for you</h2>
            {openQuotes.map((q) => (
              <Link key={q.id} href={`/cleaning/quote/${q.id}`} className="card flex items-center justify-between gap-3 p-4 hover:border-brand">
                <span><span className="font-medium">Quote #{q.quote_no}</span> <span className="text-sm text-ink-soft">{q.kind === "plan" ? "Monthly plan" : "One-off clean"}{q.valid_until ? `, valid until ${dateTimeLabel(q.valid_until)}` : ""}</span></span>
                <span className="font-bold">{nairaK(q.total_kobo)} →</span>
              </Link>
            ))}
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Upcoming visits</h2>
            {upcoming.map((v) => (
              <div key={v.id} className="card space-y-3 p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-semibold">{dayLabel(v.date)} · {v.start_time ? `about ${v.start_time.slice(0, 5)}` : v.window}</p>
                    <p className="text-sm text-ink-soft">{VISIT_KIND_LABEL[v.kind] ?? v.kind} · {SERVICE_LABEL[v.service] ?? v.service} · {v.address}</p>
                    {v.crew?.length ? <p className="text-xs text-ink-mute">Crew: {v.crew.join(", ")}</p> : null}
                  </div>
                  <span className="h-fit rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-dark">{VISIT_STATUS_LABEL[v.status] ?? v.status}</span>
                </div>
                {v.arrival_code && <p className="rounded-md bg-canvas p-3 text-sm">Arrival code: <strong className="font-mono text-lg tracking-widest">{v.arrival_code}</strong><br /><span className="text-xs text-ink-soft">Give it to the crew lead only when they arrive. Never share it on the phone.</span></p>}
                {v.completion_code && <p className="rounded-md bg-canvas p-3 text-sm">Completion code: <strong className="font-mono text-lg tracking-widest">{v.completion_code}</strong><br /><span className="text-xs text-ink-soft">Check the work, then give this code to the crew lead to sign off.</span></p>}
                {v.balance_due_kobo > 0 && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">Balance of {nairaK(v.balance_due_kobo)} is due before the crew starts. It is listed under To pay.</p>}
                {(v.extras ?? []).map((e) => <ExtraDecision key={e.id} extraId={e.id} amountKobo={e.amount_kobo} lines={e.lines} />)}
                {v.can_reschedule && <RescheduleVisit visitId={v.id} />}
                {v.status === "awaiting_signoff" && <RateVisit visitId={v.id} canComplain userId={user.id} />}
              </div>
            ))}
          </section>
        )}

        {(d?.plans.length ?? 0) > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">My plans</h2>
            {d!.plans.map((p) => (
              <div key={p.id} className="card space-y-2 p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-semibold">{p.plan ?? "Cleaning plan"}{p.bundle ? " · Home Complete" : ""}</p>
                  <span className="text-sm font-medium">{PLAN_STATUS_LABEL[p.status] ?? p.status}</span>
                </div>
                <p className="text-sm text-ink-soft">{p.visits_per_month} visits a month on {WEEKDAY_LABEL[p.weekday]}s ({p.window}) · {nairaK(p.monthly_kobo)} a month · paid {TERM_LABEL[p.term] ?? p.term} at a time · {p.address}</p>
                <p className="text-sm">Paid until <strong>{dayLabel(p.period_end)}</strong>{p.cancel_at_period_end ? " (ends then, will not renew)" : ""}.</p>
                {p.paused_from && <p className="text-sm text-ink-soft">Paused {dayLabel(p.paused_from)} to {dayLabel(p.paused_until)}.</p>}
                {p.bundle && <p className="text-sm text-emerald-800">Laundry pickup and delivery are free while this plan is paid up.</p>}
                {p.status === "past_due" && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">Your renewal is unpaid. Pay it under To pay to keep your visits.</p>}
                <PlanControls subId={p.id} status={p.status} cancelAtEnd={p.cancel_at_period_end} periodEnd={p.period_end ? dayLabel(p.period_end) : null} />
              </div>
            ))}
          </section>
        )}

        {(d?.credits.length ?? 0) > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Free visits to book</h2>
            {d!.credits.map((c) => (
              <div key={c.id} className="card space-y-2 p-4">
                <p className="text-sm">{c.reason}</p>
                <p className="text-xs text-ink-mute">Book by {dayLabel(c.expires_on)}.</p>
                <BookCredit creditId={c.id} expiresOn={c.expires_on} />
              </div>
            ))}
          </section>
        )}

        {(d?.requests.length ?? 0) > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Requests</h2>
            {d!.requests.map((r) => (
              <div key={r.id} className="card space-y-2 p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium">#{r.request_no} · {SERVICE_LABEL[r.service] ?? r.service}</p>
                  <span className="text-sm">{REQUEST_STATUS_LABEL[r.status] ?? r.status}</span>
                </div>
                {r.address && <p className="text-sm text-ink-soft">{r.address}</p>}
                {r.inspection && (
                  <div className="rounded-md bg-canvas p-3 text-sm">
                    {r.inspection.mode === "remote" ? <p>We will quote from photos or a short WhatsApp video call. Send photos to <a className="underline" href={CLEANING_WHATSAPP}>{CLEANING_HOTLINE}</a>.</p>
                      : <p>Inspection {r.inspection.scheduled_for ? `on ${dateTimeLabel(r.inspection.scheduled_for)}` : "to be arranged"}. {r.inspection.fee_kobo > 0 ? (r.inspection.fee_paid ? `Fee of ${nairaK(r.inspection.fee_kobo)} paid; it comes off your clean.` : `Fee ${nairaK(r.inspection.fee_kobo)} is due to confirm it (see To pay).`) : "No fee."}</p>}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {past.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Past visits</h2>
            {past.map((v) => (
              <div key={v.id} className="card space-y-2 p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="text-sm"><span className="font-medium">{dayLabel(v.date)}</span> · {VISIT_KIND_LABEL[v.kind] ?? v.kind} · {SERVICE_LABEL[v.service] ?? v.service}</p>
                  <span className="text-sm">{VISIT_STATUS_LABEL[v.status] ?? v.status}{v.rating ? ` · ${"★".repeat(v.rating)}` : ""}</span>
                </div>
                {v.status === "done" && !v.rating && <RateVisit visitId={v.id} canComplain={v.can_complain} userId={user.id} />}
              </div>
            ))}
          </section>
        )}

        {(d?.quotes ?? []).filter((q) => q.status !== "sent").length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Older quotes</h2>
            {d!.quotes.filter((q) => q.status !== "sent").map((q) => (
              <Link key={q.id} href={`/cleaning/quote/${q.id}`} className="flex justify-between text-sm hover:underline"><span>Quote #{q.quote_no} · {QUOTE_STATUS_LABEL[q.status] ?? q.status}</span><span>{nairaK(q.total_kobo)}</span></Link>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
