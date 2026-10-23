"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { bookPickup } from "@/app/orders/actions";
import { createClient } from "@/lib/supabase/client";
import { naira } from "@/lib/format";
import { SlotPicker } from "@/components/orders/SlotPicker";
import { inputCls, labelCls } from "@/components/admin/ui";

type Quote = { served: boolean; fare_kobo?: number | null; delivery_fare_kobo?: number | null; total_fare_kobo?: number | null; zone_name?: string; distance_km?: number; after_hours?: boolean; scheduled_for?: string | null; reason?: string };

export function BookingForm() {
  const router = useRouter();
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [slot, setSlot] = useState<string | null>(null);

  function locate() {
    setErr(null); setQuote(null);
    if (!navigator.geolocation) return setErr("Your browser cannot share its location. Try another browser.");
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(async (p) => {
      const here = { lat: p.coords.latitude, lng: p.coords.longitude };
      setPos(here);
      const { data, error } = await createClient().rpc("quote_pickup", { _lat: here.lat, _lng: here.lng });
      setLocBusy(false);
      if (error) return setErr("We could not price this location. Please try again.");
      setQuote(data as unknown as Quote);
    }, () => { setLocBusy(false); setErr("We could not get your location. Allow location access and try again."); }, { enableHighAccuracy: true, timeout: 15000 });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pos) return;
    if (when === "later" && !slot) { setErr("Choose a day and a time, or pick As soon as possible."); return; }
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    const r = await bookPickup({ ...pos, address: String(f.get("address") ?? ""), notes: String(f.get("notes") ?? ""), slot: when === "later" ? slot : null });
    if (r.ok && r.id) { router.push(`/orders/${r.id}`); return; }
    setBusy(false); setErr(r.message);
  }

  const ready = quote?.served && quote.fare_kobo != null;
  return (
    <form onSubmit={submit} className="space-y-6">
      {err && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      <div className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">1. Where should we pick up?</h2>
        <button type="button" className="btn-secondary" onClick={locate} disabled={locBusy}>{locBusy ? "Finding you" : pos ? "Update my location" : "Use my current location"}</button>
        {pos && <p className="text-xs text-ink-mute">Location captured. <a className="underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${pos.lat},${pos.lng}`}>Check it on Google Maps</a></p>}
        {quote && !quote.served && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">We do not pick up from here yet. <a className="font-semibold underline" href="/#coverage">Join the waitlist</a> and we will tell you.</p>}
        {quote?.served && quote.fare_kobo == null && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Booking in {quote.zone_name} opens very soon. Please check back.</p>}
        {ready && (
          <div className="rounded-md border border-line bg-canvas p-4 text-sm">
            <p>Area: <strong>{quote!.zone_name}</strong> · about {quote!.distance_km} km away</p>
            <dl className="mt-2 space-y-1">
              <div className="flex justify-between gap-4"><dt className="text-ink-soft">Pickup (there and back)</dt><dd>{naira(quote!.fare_kobo!)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-soft">Delivery of your clean clothes</dt><dd>{naira(quote!.delivery_fare_kobo ?? 0)}</dd></div>
              <div className="flex justify-between gap-4 border-t border-line pt-1 font-semibold"><dt>Pay once, now</dt><dd>{naira(quote!.total_fare_kobo ?? quote!.fare_kobo!)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-ink-mute">Transport for both trips is paid together, so you will not be asked for a delivery fee later. The clothes bill is separate and comes after the agent counts.</p>
            {quote!.after_hours && <p className="mt-1 text-ink-soft">We are closed now, so your pickup is scheduled for the next opening time.</p>}
          </div>
        )}
      </div>

      {ready && (
        <>
          <div className="card space-y-4 p-5">
            <h2 className="text-lg font-semibold">2. Address details</h2>
            <div><label htmlFor="address" className={labelCls}>House number, street and landmark</label><input id="address" name="address" required minLength={5} maxLength={300} className={inputCls} /></div>
            <div><label htmlFor="notes" className={labelCls}>Anything the agent should know? (optional)</label><textarea id="notes" name="notes" maxLength={500} rows={2} className={inputCls} /></div>
          </div>
          <div className="card space-y-4 p-5">
            <h2 className="text-lg font-semibold">3. When should we come?</h2>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="When">
              <button type="button" role="radio" aria-checked={when === "now"} onClick={() => { setWhen("now"); setSlot(null); }} className={`rounded-md border px-4 py-2 text-sm ${when === "now" ? "border-brand bg-brand-tint font-semibold text-brand-dark" : "border-line"}`}>As soon as possible</button>
              <button type="button" role="radio" aria-checked={when === "later"} onClick={() => setWhen("later")} className={`rounded-md border px-4 py-2 text-sm ${when === "later" ? "border-brand bg-brand-tint font-semibold text-brand-dark" : "border-line"}`}>Choose a time</button>
            </div>
            {when === "later" && <SlotPicker value={slot} onChange={setSlot} />}
          </div>
          <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Booking" : `Book and pay ${naira(quote!.total_fare_kobo ?? quote!.fare_kobo!)} transport`}</button>
        </>
      )}
    </form>
  );
}
