"use client";

import { useState } from "react";
import { chooseFulfillment } from "@/app/orders/actions";
import { naira } from "@/lib/format";
import { PayButtons } from "@/components/orders/PayButtons";

/**
 * Collection or delivery for a ready order.
 * Online orders (prepaidKobo > 0) paid for the return trip at booking: delivery to the same fare band is free,
 * a further address costs only the difference, and collecting does not refund the prepaid return.
 */
export function FulfillmentChoice({ orderId, address, lat, lng, fareKobo, status, choice, deliveryPaid, prepaidKobo = 0 }: {
  orderId: string; address: string | null; lat: number | null; lng: number | null;
  fareKobo: number | null; status: string; choice: string | null; deliveryPaid: boolean; prepaidKobo?: number;
}) {
  const prepaid = prepaidKobo > 0;
  const coveredNow = prepaid && choice === "deliver" && status === "ready" && Number(fareKobo ?? 0) === 0;
  const [mode, setMode] = useState<"collect" | "deliver" | null>(choice === "deliver" ? "deliver" : choice === "collect" ? "collect" : null);
  const [editing, setEditing] = useState(!coveredNow);
  const [covered, setCovered] = useState(coveredNow);
  const [addr, setAddr] = useState(address ?? "");
  const [coords, setCoords] = useState<{lat:number;lng:number} | null>(lat != null && lng != null ? {lat,lng} : null);
  const [useNew, setUseNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmChoice, setConfirmChoice] = useState<"collect" | "deliver" | null>(null);
  const [quote, setQuote] = useState<number | null>(status === "awaiting_delivery_fare" ? fareKobo : null);

  async function submit(next: "collect" | "deliver") {
    setBusy(true); setError(""); setNotice("");
    if (next === "deliver" && quote !== null && mode === "deliver" && (coords?.lat !== lat || coords?.lng !== lng || addr.trim() !== (address ?? "").trim())) {
      setQuote(null);
    }
    if (next === "deliver" && (!coords || !addr.trim())) {
      setBusy(false); setError("Choose a saved or current location and enter the delivery address."); return;
    }
    const result = await chooseFulfillment(orderId,next,next === "deliver" ? coords : null,next === "deliver" ? addr : "");
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setMode(next);
    if (next === "collect") {
      setQuote(0); setCovered(false);
      setNotice(prepaid ? "Collection selected. Please collect from the hub; staff will confirm the handover." : "Collection selected. No delivery fee is due. Staff will confirm the handover.");
    } else if (result.covered) {
      setQuote(0); setCovered(true); setEditing(false);
      setNotice("Delivery confirmed. Your return was paid when you booked, so there is nothing more to pay.");
    } else {
      setQuote(result.fareKobo ?? 0); setCovered(false);
      setNotice(prepaid ? "This address is further than the one you booked, so a small extra applies. Review it before paying." : "Delivery fare refreshed using the latest pricing for your selected location. Review it before paying.");
    }
  }
  function locate() {
    setError("");
    if (!navigator.geolocation) { setError("Location is not supported on this device. Use the saved location or contact the hub."); return; }
    navigator.geolocation.getCurrentPosition(p => { setCoords({lat:p.coords.latitude,lng:p.coords.longitude}); setUseNew(true); },
      () => setError("We could not get your location. Allow location access or use the saved location."),
      {enableHighAccuracy:true,timeout:12000,maximumAge:0});
  }

  const collectNote = prepaid ? "The return fare you paid at booking is not refunded if you collect." : "No delivery fee";

  if (choice === "collect" && status === "ready" && mode === "collect") return <section className="card space-y-2 p-5"><h2 className="text-lg font-semibold">Collection selected</h2><p className="text-sm text-ink-soft">{prepaid ? "Please collect from the hub; staff will confirm the handover. You can still switch back to delivery, which is already paid." : "No delivery fee is due. Please collect from the hub; staff will confirm the handover."}</p><button type="button" className="btn-secondary" onClick={()=>{setMode(null);setNotice("");setEditing(true);}}>Change to delivery</button></section>;
  if (status === "out_for_delivery" || status === "delivered") return null;
  if (deliveryPaid && choice === "deliver") return <section className="card space-y-2 p-5"><h2 className="text-lg font-semibold">Delivery fee paid</h2><p className="text-sm text-ink-soft">Your clothes remain marked ready while our team arranges the return delivery. Staff can now assign a delivery agent.</p></section>;

  if (covered && !editing && mode === "deliver") return <section className="card space-y-3 p-5">
    <h2 className="text-lg font-semibold">Your clothes are ready</h2>
    <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><strong>Return delivery already paid.</strong> You paid {naira(prepaidKobo)} for it when you booked. There is nothing more to pay.</p>
    <p className="text-sm">We will deliver to: <strong>{addr.trim() || address || "your booked address"}</strong></p>
    <p className="text-sm text-ink-soft">A rider will be assigned shortly and we will tell you when they set off. Please never pay cash to anyone for this delivery.</p>
    {notice && <p role="status" className="text-sm text-ink-soft">{notice}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary" onClick={()=>{setEditing(true);setNotice("");}}>Deliver somewhere else</button>
      <button type="button" className="btn-secondary" onClick={()=>setConfirmChoice("collect")}>I&apos;ll collect from the hub</button>
    </div>
    {confirmChoice && <ConfirmDialog choice={confirmChoice} addr={addr} prepaid={prepaid} busy={busy} error={error} onCancel={()=>setConfirmChoice(null)} onConfirm={async()=>{const next=confirmChoice; setConfirmChoice(null); await submit(next);}} />}
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </section>;

  return <section className="card space-y-4 p-5">
    <h2 className="text-lg font-semibold">Your clothes are ready</h2>
    {prepaid
      ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">Your return delivery was paid when you booked ({naira(prepaidKobo)}). Delivery to an address in the same fare band costs nothing more; a further address costs only the difference.</p>
      : <p className="text-sm text-ink-soft">Choose collection or delivery. Delivery pricing is recalculated from the latest fare rules before you pay.</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" disabled={busy} onClick={()=>setConfirmChoice("collect")} className={`rounded-xl border p-4 text-left ${mode==="collect"?"border-brand bg-brand-tint":"border-line"}`}><strong>Collect my clothes</strong><span className="mt-1 block text-sm text-ink-soft">{collectNote}</span></button>
      <button type="button" disabled={busy} onClick={()=>{setMode("deliver");setError("");setQuote(null);}} className={`rounded-xl border p-4 text-left ${mode==="deliver"?"border-brand bg-brand-tint":"border-line"}`}><strong>Deliver to my address</strong><span className="mt-1 block text-sm text-ink-soft">{prepaid ? "Already paid at booking" : "Fare confirmed before payment"}</span></button>
    </div>
    {mode==="deliver" && <>
      <label className="block text-sm font-medium">Delivery address<textarea value={addr} onChange={e=>{setAddr(e.target.value);setQuote(null);}} maxLength={300} rows={2} className="mt-1 w-full rounded-lg border border-line p-3" placeholder="Enter your delivery address"/></label>
      <p className="text-sm text-ink-soft">Saved address: {address || "No saved address."}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" disabled={busy || lat==null || lng==null} onClick={()=>{setCoords({lat:lat!,lng:lng!});setUseNew(false);setQuote(null);}}>Use saved GPS</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={()=>{setQuote(null);locate();}}>Use current GPS</button>
      </div>
      {coords && <p className="text-xs text-ink-soft">{useNew?"Using updated device location.":"Using saved order location."}</p>}
      <button type="button" disabled={busy} onClick={()=>setConfirmChoice("deliver")} className="btn-primary w-full min-h-12 whitespace-normal break-words px-3 py-3 text-sm leading-tight sm:text-base">{busy?"Checking…":prepaid?"Confirm delivery address":"Confirm address and refresh fare"}</button>
      {quote!==null && quote>0 && <div className="space-y-3 rounded-lg border border-line p-4">
        {prepaid
          ? <><p>Extra for this further address: <strong>{naira(quote)}</strong></p><p className="text-xs text-ink-soft">Your {naira(prepaidKobo)} prepaid return is already deducted. You only pay the difference.</p></>
          : <><p>Current delivery fare: <strong>{naira(quote)}</strong></p><p className="text-xs text-ink-soft">This is separate from your earlier transport payment.</p></>}
        <PayButtons orderId={orderId} purpose="delivery_fare" label={prepaid ? `Pay ${naira(quote)} extra` : `Pay ${naira(quote)} delivery`}/>
      </div>}
    </>}
    {notice && <p role="status" className="text-sm text-ink-soft">{notice}</p>}
    {confirmChoice && <ConfirmDialog choice={confirmChoice} addr={addr} prepaid={prepaid} busy={busy} error={error} onCancel={()=>setConfirmChoice(null)} onConfirm={async()=>{const next=confirmChoice; setConfirmChoice(null); await submit(next);}} />}
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </section>;
}

function ConfirmDialog({ choice, addr, prepaid, busy, error, onCancel, onConfirm }: {
  choice: "collect" | "deliver"; addr: string; prepaid: boolean; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void;
}) {
  const body = choice === "collect"
    ? (prepaid
      ? "You will collect your clothes from the LaundryPoint hub. The return delivery you paid for at booking is not refunded. Staff will confirm the handover when you collect."
      : "You will collect your clothes from the LaundryPoint hub. No delivery fee will be charged. Staff will see your choice and confirm the handover when you collect your clothes.")
    : (prepaid
      ? `You want your clothes delivered to ${addr.trim()}. Your return is already paid; if this address is further than the one you booked, we will show you the small extra before you pay anything.`
      : `You want your clothes delivered to ${addr.trim()}. We will save this address and calculate the current delivery fare. You can review the fare before paying.`);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="fulfillment-confirm-title" className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 text-ink shadow-xl"><h3 id="fulfillment-confirm-title" className="text-lg font-semibold">Confirm {choice === "collect" ? "collection" : "delivery"}</h3><p className="text-sm text-ink-soft">{body}</p>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={onConfirm}>{busy ? "Saving…" : "Confirm choice"}</button></div></section></div>;
}
