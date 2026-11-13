"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, labelCls } from "@/components/admin/ui";
import { TERM_LABEL, TERM_MONTHS, WINDOW_LABEL, dayLabel, nairaK } from "@/lib/cleaning";
import { acceptCleaningQuote, cleaningSlots, declineCleaningQuote } from "@/app/cleaning/actions";
import { Msg, PayInvoice, type R } from "./shared";

type Props = {
  quoteId: string; kind: "one_off" | "plan"; zoneId: string | null; crew: number; duration: number;
  visitPriceKobo: number; monthlyKobo: number; firstDeepKobo: number; creditKobo: number;
  depositAllowed: boolean; depositPct: number; termDiscounts: Record<string, number>;
};

const roundTo = (kobo: number, step: number) => Math.round(kobo / step) * step;

export function QuoteAccept(p: Props) {
  const router = useRouter();
  const [slots, setSlots] = useState<{ date: string; weekday: number; zone_day: boolean }[] | null>(null);
  const [date, setDate] = useState("");
  const [win, setWin] = useState("morning");
  const [term, setTerm] = useState("monthly");
  const [deposit, setDeposit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);
  const [invoice, setInvoice] = useState<{ id: string; amount: number } | null>(null);
  const [declining, setDeclining] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!p.zoneId) { setSlots([]); return; }
    cleaningSlots(p.zoneId, p.crew, p.duration).then((s) => { if (alive) { setSlots(s); setDate(s.find((x) => x.zone_day)?.date ?? s[0]?.date ?? ""); } });
    return () => { alive = false; };
  }, [p.zoneId, p.crew, p.duration]);

  const amount = useMemo(() => {
    if (p.kind === "one_off") {
      const base = deposit ? roundTo(p.visitPriceKobo * p.depositPct / 100, 5000) : p.visitPriceKobo;
      return Math.max(0, base - p.creditKobo);
    }
    const months = TERM_MONTHS[term] ?? 1;
    const disc = Number(p.termDiscounts?.[term] ?? 0);
    return Math.max(0, p.firstDeepKobo + roundTo(p.monthlyKobo * months * (1 - disc / 100), 50000) - p.creditKobo);
  }, [p, term, deposit]);

  async function accept() {
    if (!date) { setM({ ok: false, message: "Choose a day." }); return; }
    setBusy(true); setM(null);
    const r = await acceptCleaningQuote(p.quoteId, { date, window: win, term, deposit });
    setBusy(false);
    if (!r.ok) {
      setM(r);
      if (r.message.includes("fully booked") || r.message.includes("no longer available")) {
        const s = p.zoneId ? await cleaningSlots(p.zoneId, p.crew, p.duration) : [];
        setSlots(s);
      }
      return;
    }
    if (r.paid) { router.push("/cleaning/my?booked=1"); return; }
    setInvoice({ id: r.invoiceId!, amount: r.amountKobo ?? amount });
  }

  async function decline(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
    setBusy(true);
    const r = await declineCleaningQuote(p.quoteId, reason);
    setBusy(false); setM(r);
    if (r.ok) router.refresh();
  }

  if (invoice) {
    return (
      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Pay {nairaK(invoice.amount)} to confirm</h2>
        <p className="text-sm text-ink-soft">We are holding {dayLabel(date)} ({win}) for you for 30 minutes. Your booking is confirmed as soon as payment goes through.</p>
        <PayInvoice invoiceId={invoice.id} label={`Pay ${nairaK(invoice.amount)}`} />
        <button type="button" className="text-sm underline" onClick={() => setInvoice(null)}>Choose a different day</button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">{p.kind === "plan" ? "Choose your first visit and plan length" : "Choose your day"}</h2>
        <Msg m={m} />
        {slots === null ? <p className="text-sm text-ink-soft">Loading free days…</p> : slots.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No free days in the next 30 days for a job this size. Call or WhatsApp 0913 258 4627 and we will fit you in.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="date" className={labelCls}>Day</label>
              <select id="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)}>
                {slots.map((s) => <option key={s.date} value={s.date}>{dayLabel(s.date)}{s.zone_day ? " (best day for your area)" : ""}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="window" className={labelCls}>Time</label>
              <select id="window" className={inputCls} value={win} onChange={(e) => setWin(e.target.value)}>
                {Object.entries(WINDOW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        )}
        {p.kind === "plan" && (
          <div>
            <label htmlFor="term" className={labelCls}>Pay for</label>
            <select id="term" className={inputCls} value={term} onChange={(e) => setTerm(e.target.value)}>
              {Object.keys(TERM_LABEL).map((k) => <option key={k} value={k}>{TERM_LABEL[k]}{Number(p.termDiscounts?.[k] ?? 0) > 0 ? ` (save ${p.termDiscounts[k]}%)` : ""}</option>)}
            </select>
            <p className="mt-1 text-xs text-ink-mute">Your regular visits are on the same weekday as your first visit. You can pause for up to 31 days a year, with 7 days notice.</p>
          </div>
        )}
        {p.kind === "one_off" && p.depositAllowed && (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={deposit} onChange={(e) => setDeposit(e.target.checked)} />
            <span>Pay a {p.depositPct}% deposit now and the balance before the crew starts.</span>
          </label>
        )}
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm font-medium">To pay now{p.creditKobo > 0 ? " (after your inspection credit)" : ""}</span>
          <span className="text-lg font-bold">{amount === 0 ? "Nothing" : nairaK(amount)}</span>
        </div>
        <button type="button" className="btn-primary w-full sm:w-auto" onClick={accept} disabled={busy || !date}>{busy ? "Holding your time…" : amount === 0 ? "Confirm booking" : "Accept and continue to payment"}</button>
      </section>
      <section className="card p-5">
        {!declining ? <button type="button" className="text-sm underline" onClick={() => setDeclining(true)}>Not for me: decline this quote</button> : (
          <form onSubmit={decline} className="space-y-2">
            <label htmlFor="reason" className={labelCls}>What should we know? (optional)</label>
            <input id="reason" name="reason" maxLength={300} className={inputCls} placeholder="For example: price too high, found someone else, changed plans" />
            <div className="flex gap-2"><button className="btn-secondary" disabled={busy}>Decline quote</button><button type="button" className="text-sm underline" onClick={() => setDeclining(false)}>Keep it</button></div>
          </form>
        )}
      </section>
    </div>
  );
}
