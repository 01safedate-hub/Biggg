"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, labelCls } from "@/components/admin/ui";
import { WINDOW_LABEL, lagosDate, nairaK } from "@/lib/cleaning";
import { bookCleaningCredit, cancelCleaningPlan, complainCleaningVisit, decideCleaningExtra, pauseCleaningPlan, rateCleaningVisit, rescheduleCleaningVisit } from "@/app/cleaning/actions";
import { Msg, PhotoUpload, type R } from "./shared";

function DateWindow({ onSubmit, busy, submitLabel, max }: { onSubmit: (date: string, win: string) => void; busy: boolean; submitLabel: string; max?: string }) {
  const [date, setDate] = useState(lagosDate(2));
  const [win, setWin] = useState("morning");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div><label className={labelCls}>Day</label><input type="date" className={inputCls} value={date} min={lagosDate(1)} max={max ?? lagosDate(60)} onChange={(e) => setDate(e.target.value)} /></div>
      <div><label className={labelCls}>Time</label><select className={inputCls} value={win} onChange={(e) => setWin(e.target.value)}>{Object.entries(WINDOW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <button type="button" className="btn-secondary" disabled={busy || !date} onClick={() => onSubmit(date, win)}>{busy ? "Saving…" : submitLabel}</button>
    </div>
  );
}

export function RescheduleVisit({ visitId, maxDate }: { visitId: string; maxDate?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);
  if (!open) return <button type="button" className="text-sm font-medium underline" onClick={() => setOpen(true)}>Move to another day</button>;
  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      <p className="text-xs text-ink-soft">Sundays are closed. If the day is full we will tell you.</p>
      <DateWindow busy={busy} submitLabel="Move visit" max={maxDate} onSubmit={async (d, w) => { setBusy(true); const r = await rescheduleCleaningVisit(visitId, d, w); setBusy(false); setM(r); if (r.ok) { setOpen(false); router.refresh(); } }} />
      <Msg m={m} />
    </div>
  );
}

export function RateVisit({ visitId, canComplain, userId }: { visitId: string; canComplain: boolean; userId: string }) {
  const router = useRouter();
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);
  const [complain, setComplain] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  async function rate() {
    setBusy(true); const r = await rateCleaningVisit(visitId, stars, note); setBusy(false); setM(r); if (r.ok) router.refresh();
  }
  async function sendComplaint() {
    setBusy(true); const r = await complainCleaningVisit(visitId, note, photos); setBusy(false); setM(r); if (r.ok) { setComplain(false); router.refresh(); }
  }
  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      {!complain ? (
        <>
          <p className="text-sm font-medium">How did we do?</p>
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setStars(n)} className={`text-2xl ${n <= stars ? "text-amber-500" : "text-ink-mute"}`}>★</button>)}
          </div>
          <input className={inputCls} maxLength={500} placeholder="Anything to add? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn-secondary" disabled={busy || stars === 0} onClick={rate}>{busy ? "Saving…" : "Send rating"}</button>
            {canComplain && <button type="button" className="text-sm underline" onClick={() => setComplain(true)}>Something was missed</button>}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">Tell us what was missed. We come back to fix it free.</p>
          <textarea className={inputCls} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the kitchen tiles behind the cooker were not done." />
          <PhotoUpload folder={`requests/${userId}`} value={photos} onChange={setPhotos} label="Add a photo" />
          <div className="flex gap-3">
            <button type="button" className="btn-secondary" disabled={busy || note.trim().length < 3} onClick={sendComplaint}>{busy ? "Sending…" : "Send"}</button>
            <button type="button" className="text-sm underline" onClick={() => setComplain(false)}>Back</button>
          </div>
        </>
      )}
      <Msg m={m} />
    </div>
  );
}

export function ExtraDecision({ extraId, amountKobo, lines }: { extraId: string; amountKobo: number; lines: { label: string; qty: number; amount_kobo: number }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);
  async function go(ok: boolean) { setBusy(true); const r = await decideCleaningExtra(extraId, ok); setBusy(false); setM(r); if (r.ok) router.refresh(); }
  return (
    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-900">The crew found extra work: {nairaK(amountKobo)}</p>
      <ul className="text-sm text-amber-900">{lines.map((l, i) => <li key={i}>{l.label}{l.qty > 1 ? ` × ${l.qty}` : ""}: {nairaK(l.amount_kobo)}</li>)}</ul>
      <p className="text-xs text-amber-900">Nothing extra is done unless you approve.</p>
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => go(true)}>Approve</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => go(false)}>Decline</button>
      </div>
      <Msg m={m} />
    </div>
  );
}

export function PlanControls({ subId, status, cancelAtEnd, periodEnd }: { subId: string; status: string; cancelAtEnd: boolean; periodEnd: string | null }) {
  const router = useRouter();
  const [pause, setPause] = useState(false);
  const [from, setFrom] = useState(lagosDate(7));
  const [until, setUntil] = useState(lagosDate(14));
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);
  async function cancel(undo: boolean) {
    if (!undo && !confirm(`End your plan on ${periodEnd ?? "the end of this period"}? Visits already paid for still happen.`)) return;
    setBusy(true); const r = await cancelCleaningPlan(subId, undo); setBusy(false); setM(r); if (r.ok) router.refresh();
  }
  async function doPause() { setBusy(true); const r = await pauseCleaningPlan(subId, from, until); setBusy(false); setM(r); if (r.ok) { setPause(false); router.refresh(); } }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-sm">
        {status === "active" && !pause && <button type="button" className="font-medium underline" onClick={() => setPause(true)}>Pause (travelling?)</button>}
        {cancelAtEnd ? <button type="button" className="font-medium underline" disabled={busy} onClick={() => cancel(true)}>Keep my plan</button>
          : <button type="button" className="font-medium text-red-700 underline" disabled={busy} onClick={() => cancel(false)}>End plan at period end</button>}
      </div>
      {pause && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-line p-3">
          <div><label className={labelCls}>From</label><input type="date" className={inputCls} min={lagosDate(7)} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className={labelCls}>Until</label><input type="date" className={inputCls} min={from} value={until} onChange={(e) => setUntil(e.target.value)} /></div>
          <button type="button" className="btn-secondary" disabled={busy} onClick={doPause}>{busy ? "Saving…" : "Pause visits"}</button>
          <button type="button" className="text-sm underline" onClick={() => setPause(false)}>Close</button>
          <p className="w-full text-xs text-ink-mute">Up to 31 days a year, booked 7 days ahead. Your paid period is extended by the paused days.</p>
        </div>
      )}
      <Msg m={m} />
    </div>
  );
}

export function BookCredit({ creditId, expiresOn }: { creditId: string; expiresOn: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);
  return (
    <div className="space-y-2">
      <DateWindow busy={busy} submitLabel="Book this visit" max={expiresOn} onSubmit={async (d, w) => { setBusy(true); const r = await bookCleaningCredit(creditId, d, w); setBusy(false); setM(r); if (r.ok) router.refresh(); }} />
      <Msg m={m} />
    </div>
  );
}
