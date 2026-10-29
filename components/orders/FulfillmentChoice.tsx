"use client";

import { useState } from "react";
import { chooseFulfillment } from "@/app/orders/actions";
import { naira } from "@/lib/format";
import { PayButtons } from "@/components/orders/PayButtons";

export function FulfillmentChoice({ orderId, address, lat, lng, fareKobo, status, choice, deliveryPaid }: {
  orderId: string; address: string | null; lat: number | null; lng: number | null;
  fareKobo: number | null; status: string; choice: string | null; deliveryPaid: boolean;
}) {
  const [mode, setMode] = useState<"collect" | "deliver" | null>(choice === "deliver" ? "deliver" : choice === "collect" ? "collect" : null);
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
    if (next === "collect") { setQuote(0); setNotice("Collection selected. No delivery fee is due. Staff will confirm the handover."); }
    else { setQuote(result.fareKobo ?? 0); setNotice("Delivery fare refreshed using the latest pricing for your selected location. Review it before paying."); }
  }
  function locate() {
    setError("");
    if (!navigator.geolocation) { setError("Location is not supported on this device. Use the saved location or contact the hub."); return; }
    navigator.geolocation.getCurrentPosition(p => { setCoords({lat:p.coords.latitude,lng:p.coords.longitude}); setUseNew(true); },
      () => setError("We could not get your location. Allow location access or use the saved location."),
      {enableHighAccuracy:true,timeout:12000,maximumAge:0});
  }
  if (choice === "collect" && status === "ready" && mode === "collect") return <section className="card space-y-2 p-5"><h2 className="text-lg font-semibold">Collection selected</h2><p className="text-sm text-ink-soft">No delivery fee is due. Please collect from the hub; staff will confirm the handover.</p><button type="button" className="btn-secondary" onClick={()=>{setMode(null);setNotice("");}}>Change to delivery</button></section>;
  if (status === "out_for_delivery" || status === "delivered") return null;
  if (deliveryPaid && choice === "deliver") return <section className="card space-y-2 p-5"><h2 className="text-lg font-semibold">Delivery fee paid</h2><p className="text-sm text-ink-soft">Your clothes remain marked ready while our team arranges the return delivery. Staff can now assign a delivery agent.</p></section>;
  return <section className="card space-y-4 p-5">
    <h2 className="text-lg font-semibold">Your clothes are ready</h2>
    <p className="text-sm text-ink-soft">Choose collection or delivery. Delivery pricing is recalculated from the latest fare rules before you pay.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" disabled={busy} onClick={()=>setConfirmChoice("collect")} className={`rounded-xl border p-4 text-left ${mode==="collect"?"border-brand bg-brand-tint":"border-line"}`}><strong>Collect my clothes</strong><span className="mt-1 block text-sm text-ink-soft">No delivery fee</span></button>
      <button type="button" disabled={busy} onClick={()=>{setMode("deliver");setError("");setQuote(null);}} className={`rounded-xl border p-4 text-left ${mode==="deliver"?"border-brand bg-brand-tint":"border-line"}`}><strong>Deliver to my address</strong><span className="mt-1 block text-sm text-ink-soft">Fare confirmed before payment</span></button>
    </div>
    {mode==="deliver" && <>
      <label className="block text-sm font-medium">Delivery address<textarea value={addr} onChange={e=>{setAddr(e.target.value);setQuote(null);}} maxLength={300} rows={2} className="mt-1 w-full rounded-lg border border-line p-3" placeholder="Enter your delivery address"/></label>
      <p className="text-sm text-ink-soft">Saved address: {address || "No saved address."}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" disabled={busy || lat==null || lng==null} onClick={()=>{setCoords({lat:lat!,lng:lng!});setUseNew(false);setQuote(null);}}>Use saved GPS</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={()=>{setQuote(null);locate();}}>Use current GPS</button>
      </div>
      {coords && <p className="text-xs text-ink-soft">{useNew?"Using updated device location.":"Using saved order location."}</p>}
      <button type="button" disabled={busy} onClick={()=>setConfirmChoice("deliver")} className="btn-primary w-full min-h-12 whitespace-normal break-words px-3 py-3 text-sm leading-tight sm:text-base">{busy?"Checking latest fare…":"Confirm address and refresh fare"}</button>
      {quote!==null && quote>0 && <div className="space-y-3 rounded-lg border border-line p-4"><p>Current delivery fare: <strong>{naira(quote)}</strong></p><p className="text-xs text-ink-soft">This is separate from your earlier transport payment.</p><PayButtons orderId={orderId} purpose="delivery_fare" label={`Pay ${naira(quote)} delivery`}/></div>}
    </>}
    {notice && <p role="status" className="text-sm text-ink-soft">{notice}</p>}
    {confirmChoice && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="fulfillment-confirm-title" className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 text-ink shadow-xl"><h3 id="fulfillment-confirm-title" className="text-lg font-semibold">Confirm {confirmChoice === "collect" ? "collection" : "delivery"}</h3><p className="text-sm text-ink-soft">{confirmChoice === "collect" ? "You will collect your clothes from the LaundryPoint hub. No delivery fee will be charged. Staff will see your choice and confirm the handover when you collect your clothes." : `You want your clothes delivered to ${addr.trim()}. We will save this address and calculate the current delivery fare. You can review the fare before paying.`}</p>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={busy} onClick={()=>setConfirmChoice(null)}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={async()=>{const next=confirmChoice; setConfirmChoice(null); await submit(next);}}>{busy ? "Saving…" : "Confirm choice"}</button></div></section></div>}
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </section>;
}
