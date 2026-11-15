"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addCustomerEmail, cancelQuickOrder, confirmPayLater, deskMarkPayLater, finishQuickOrder, startQuickOrder } from "@/app/staff/(app)/pay-later-actions";
import { inputCls, labelCls } from "@/components/admin/ui";
import { naira } from "@/lib/format";

export type Bank = { bank_name: string | null; account_number: string | null; account_name: string | null; money_point_id: string | null };
type Run = (key: string, fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) => Promise<void>;

function useRun(): [string | null, { ok: boolean; text: string } | null, Run] {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run: Run = async (key, fn, after) => {
    setBusy(key); setMsg(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) { setMsg({ ok: false, text: r.message }); return; }
    if (r.message) setMsg({ ok: true, text: r.message });
    if (after) after(); else router.refresh();
  };
  return [busy, msg, run];
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p role={msg.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>;
}

// ---------- agent: start a quick order ----------
export function QuickOrderStart() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, msg, run] = useRun();
  const [locErr, setLocErr] = useState<string | null>(null);

  function locate() {
    setLocErr(null);
    if (!navigator.geolocation) { setLocErr("This phone cannot share its location. Use another phone."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); },
      () => { setLocating(false); setLocErr("Could not get your location. Allow location for this site and turn on GPS, then try again."); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  return (
    <form className="card space-y-4 p-5" data-guide="quick-order-form" onSubmit={(e) => {
      e.preventDefault();
      if (!pos) { setLocErr("Get your location first. We deliver the clothes back here."); return; }
      void run("start", async () => {
        const r = await startQuickOrder({ name, phone, email, whatsappOptIn: optIn, lat: pos.lat, lng: pos.lng, accuracy: pos.acc, address, notes });
        if (r.ok && r.id) router.push(`/staff/jobs/${r.id}`);
        return { ok: r.ok, message: r.ok ? "" : r.message };
      }, () => undefined);
    }}>
      <div>
        <h2 className="text-lg font-semibold">New quick order</h2>
        <p className="mt-1 text-sm text-ink-soft">Use this when someone you meet wants to give you clothes now. Stand where the clothes will be delivered back.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="qn" className={labelCls}>Customer&apos;s full name</label><input id="qn" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} className={inputCls} autoComplete="off" /></div>
        <div><label htmlFor="qp" className={labelCls}>Phone number</label><input id="qp" value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" className={inputCls} placeholder="08012345678" autoComplete="off" /></div>
        <div className="sm:col-span-2">
          <label htmlFor="qe" className={labelCls}>Email (optional, but ask for it)</label>
          <input id="qe" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} className={inputCls} placeholder="name@example.com" autoComplete="off" />
          <p className="mt-1 text-xs text-ink-soft">With an email the customer can track the order and confirm delivery on their phone. Without one, the office adds it before delivery.</p>
        </div>
        <div className="sm:col-span-2"><label htmlFor="qa" className={labelCls}>Address (where we bring the clothes back)</label><input id="qa" value={address} onChange={(e) => setAddress(e.target.value)} required minLength={5} maxLength={300} className={inputCls} placeholder="Lodge name, room, street, landmark" /></div>
        <div className="sm:col-span-2"><label htmlFor="qno" className={labelCls}>Note (optional)</label><input id="qno" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className={inputCls} placeholder="For example: white shirt has a stain on the collar" /></div>
        <div className="sm:col-span-2"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-1" /><span>Customer agrees to receive WhatsApp order updates from LaundryPoint (optional).</span></label></div>
      </div>
      <div className="rounded-md border border-line bg-canvas p-3 text-sm">
        {pos ? <p className={pos.acc > 300 ? "text-red-700" : "text-emerald-800"}>Location saved (accurate to about {pos.acc} m).{pos.acc > 300 ? " That is not accurate enough. Go outside and try again." : ""}</p> : <p className="text-ink-soft">We need your location to set the delivery fee and route.</p>}
        <button type="button" className="btn-secondary mt-2" onClick={locate} disabled={locating}>{locating ? "Getting location" : pos ? "Get location again" : "Use my location"}</button>
        {locErr && <p role="alert" className="mt-2 text-red-700">{locErr}</p>}
      </div>
      <Msg msg={msg} />
      <button className="btn-primary w-full sm:w-auto" disabled={!!busy || !pos || pos.acc > 300}>{busy ? "Starting" : "Start quick order and count the clothes"}</button>
    </form>
  );
}

// ---------- agent: get paid on the spot ----------
export function QuickPayPanel({ orderId, orderNo, itemsKobo, fareKobo, fareWaivedKobo, bank, firstName }: {
  orderId: string; orderNo: number; itemsKobo: number; fareKobo: number; fareWaivedKobo: number; bank: Bank | null; firstName: string;
}) {
  const [busy, msg, run] = useRun();
  const [choice, setChoice] = useState<"transferred" | "pay_later" | null>(null);
  const [note, setNote] = useState("");
  const total = itemsKobo + fareKobo;
  const hasBank = !!bank?.account_number;
  const share = hasBank
    ? `Hello ${firstName}, your LaundryPoint bill for order #${orderNo} is ${naira(total)} (washing ${naira(itemsKobo)}${fareKobo > 0 ? ` + delivery ${naira(fareKobo)}` : ""}). Please transfer to ${bank?.bank_name ?? ""}, account ${bank?.account_number}, ${bank?.account_name ?? "LaundryPoint"}. Thank you.`
    : "";
  return (
    <section className="space-y-4" data-guide="quick-pay">
      <div className="card space-y-1 p-5">
        <p className="text-sm text-ink-soft">Washing {naira(itemsKobo)}{fareKobo > 0 ? ` + delivery back ${naira(fareKobo)}` : fareWaivedKobo > 0 ? " · delivery back is free for this customer" : ""}</p>
        <p className="text-3xl font-bold">Customer pays {naira(total)}</p>
      </div>
      {hasBank ? (
        <div className="rounded-xl border-2 border-brand bg-brand-tint p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-dark">Ask the customer to transfer now</p>
          <p className="mt-3 text-sm text-ink-soft">{bank?.bank_name}</p>
          <p className="select-all font-mono text-3xl font-bold tracking-wider">{bank?.account_number}</p>
          <p className="text-lg font-semibold">{bank?.account_name}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => void navigator.clipboard?.writeText(String(bank?.account_number ?? ""))}>Copy account number</button>
            <a className="btn-secondary" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(share)}`}>Send details on WhatsApp</a>
          </div>
        </div>
      ) : <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">The bank account is not set up. Call the office before you take these clothes.</p>}
      <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Never take cash.</strong> Wait while the customer transfers, and look at the success screen on their phone. Pay later is only for when they truly cannot pay now.</p>

      <div className="card space-y-3 p-5">
        <p className="font-semibold">What happened?</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Payment">
          <button type="button" role="radio" aria-checked={choice === "transferred"} onClick={() => { setChoice("transferred"); setNote(""); }} className={`rounded-md border px-4 py-2 text-sm ${choice === "transferred" ? "border-brand bg-brand-tint font-semibold text-brand-dark" : "border-line"}`}>Customer has transferred</button>
          <button type="button" role="radio" aria-checked={choice === "pay_later"} onClick={() => { setChoice("pay_later"); setNote(""); }} className={`rounded-md border px-4 py-2 text-sm ${choice === "pay_later" ? "border-amber-500 bg-amber-50 font-semibold text-amber-950" : "border-line"}`}>Customer will pay later</button>
        </div>
        {choice && (
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            if (choice === "pay_later" && !window.confirm("Mark as pay later? The clothes stay at the hub until the customer pays.")) return;
            void run("fin", () => finishQuickOrder(orderId, choice, note));
          }}>
            <div>
              <label htmlFor="qnote" className={labelCls}>{choice === "transferred" ? "Name on the transfer (as shown on their phone)" : "Why can they not pay now?"}</label>
              <input id="qnote" value={note} onChange={(e) => setNote(e.target.value)} required minLength={choice === "transferred" ? 3 : 5} maxLength={200} className={inputCls} placeholder={choice === "transferred" ? "For example: CHIJIOKE MICHAEL" : "For example: will transfer tonight after work"} />
              {choice === "transferred" && <p className="mt-1 text-xs text-ink-soft">The office checks the money arrived. You are not marking it paid.</p>}
              {choice === "pay_later" && <p className="mt-1 text-xs text-ink-soft">Tell the customer: the clothes will be washed, but we only deliver them after payment.</p>}
            </div>
            <button className="btn-primary" disabled={!!busy}>{busy ? "Saving" : choice === "transferred" ? "Save and take the clothes" : "Save as pay later and take the clothes"}</button>
          </form>
        )}
        <Msg msg={msg} />
      </div>
    </section>
  );
}

export function QuickCancel({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, msg, run] = useRun();
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-red-700">Customer changed their mind: cancel this quick order</summary>
      <div className="mt-2 space-y-2">
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why? (required)" aria-label="Reason" className={inputCls} />
        <button type="button" className="btn-secondary" disabled={!!busy || reason.trim().length < 3} onClick={() => { if (window.confirm("Cancel this quick order? Leave the clothes with the customer.")) void run("can", () => cancelQuickOrder(orderId, reason), () => router.push("/staff/quick-order")); }}>Cancel quick order</button>
        <Msg msg={msg} />
      </div>
    </details>
  );
}

// ---------- add an email later ----------
export function AddEmail({ customerId, orderId, why }: { customerId: string; orderId: string; why?: string }) {
  const [email, setEmail] = useState("");
  const [busy, msg, run] = useRun();
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4" data-guide="add-email">
      <p className="text-sm font-semibold text-amber-950">This customer has no email yet</p>
      <p className="text-sm text-amber-950">{why ?? "Add it when you get it. We send them a link to choose a password so they can track orders and confirm delivery."}</p>
      <div className="flex flex-wrap gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Customer email" placeholder="name@example.com" className={`${inputCls} max-w-xs`} />
        <button type="button" className="btn-primary" disabled={!!busy || email.trim().length < 5} onClick={() => run("up", () => addCustomerEmail(customerId, email, orderId))}>{busy ? "Saving" : "Save email"}</button>
      </div>
      <Msg msg={msg} />
    </div>
  );
}

// ---------- desk: walk-in customer will pay later ----------
export function DeskPayLater({ orderId }: { orderId: string }) {
  const [reason, setReason] = useState("");
  const [busy, msg, run] = useRun();
  return (
    <details className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" data-guide="desk-pay-later">
      <summary className="cursor-pointer font-medium text-amber-950">Customer cannot pay now: pay later</summary>
      <div className="mt-3 space-y-2 text-amber-950">
        <p>The clothes are washed, but they are not handed over or delivered until the bill is paid. A customer can owe on at most 3 orders.</p>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why? For example: will transfer tomorrow morning" aria-label="Reason" className={inputCls} />
        <button type="button" className="btn-secondary" disabled={!!busy || reason.trim().length < 5} onClick={() => { if (window.confirm("Mark this order as pay later?")) void run("pl", () => deskMarkPayLater(orderId, reason)); }}>{busy ? "Saving" : "Mark as pay later"}</button>
        <Msg msg={msg} />
      </div>
    </details>
  );
}

// ---------- money staff: record or confirm the payment ----------
export type Claim = { sender?: string; amount_kobo?: number; at?: string } | null;
export function PayLaterPanel({ orderId, amountKobo, reason, claim, takenBy, since, points, defaultPoint, canConfirm }: {
  orderId: string; amountKobo: number; reason: string | null; claim: Claim; takenBy: string | null; since: string | null;
  points: { id: string; name: string }[]; defaultPoint: string | null; canConfirm: boolean;
}) {
  const [mode, setMode] = useState<"cash" | "transfer" | "pos">(claim ? "transfer" : "cash");
  const [point, setPoint] = useState(claim && defaultPoint && points.some((p) => p.id === defaultPoint) ? defaultPoint : points[0]?.id ?? "");
  const [note, setNote] = useState(claim?.sender ?? "");
  const [busy, msg, run] = useRun();
  const due = naira(amountKobo);
  return (
    <section className="space-y-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-5 text-amber-950" data-guide="pay-later-panel">
      <h2 className="text-lg font-bold">Not paid yet: {due}</h2>
      <p className="text-sm">{claim
        ? <>The agent says the customer transferred{claim.sender ? <> from <strong>{claim.sender}</strong></> : null}. Check the bank app for this money before you confirm.</>
        : <>Pay later{reason ? <>: {reason}</> : null}.</>}
        {takenBy ? <> Recorded by {takenBy}</> : null}{since ? <> on {new Date(since).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })}</> : null}.</p>
      <p className="text-sm font-medium">The clothes may be washed, but they are not handed over or delivered until this is paid.</p>
      {canConfirm ? (
        points.length === 0 ? <p role="alert" className="text-sm">No money point is set up yet.</p> : (
          <form className="space-y-3 rounded-lg border border-amber-300 bg-white p-4 text-ink" onSubmit={(e) => {
            e.preventDefault();
            if (!window.confirm(`Confirm ${due} (${mode}) has really arrived?`)) return;
            void run("pay", () => confirmPayLater(orderId, mode, point, note));
          }}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How they paid">
              {(["transfer", "cash", "pos"] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`rounded-md border px-4 py-2 text-sm ${mode === m ? "border-brand bg-brand-tint font-semibold text-brand-dark" : "border-line"}`}>{m === "cash" ? "Cash" : m === "transfer" ? "Bank transfer" : "POS card"}</button>)}
            </div>
            <div><label htmlFor="plmp" className={labelCls}>Money went into</label><select id="plmp" value={point} onChange={(e) => setPoint(e.target.value)} className={inputCls}>{points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            {mode !== "cash" && <div><label htmlFor="pln" className={labelCls}>{mode === "transfer" ? "Sender name or transfer reference" : "POS receipt number"}</label><input id="pln" value={note} onChange={(e) => setNote(e.target.value)} required minLength={3} maxLength={200} className={inputCls} /></div>}
            <button className="btn-primary" disabled={!!busy || !point}>{busy ? "Recording" : `Confirm ${due} received`}</button>
          </form>
        )
      ) : <p className="text-sm">A cashier, secretary or admin confirms the payment.</p>}
      <Msg msg={msg} />
    </section>
  );
}
