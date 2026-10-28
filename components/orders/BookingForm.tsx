"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { bookPickup } from "@/app/orders/actions";
import { createClient } from "@/lib/supabase/client";
import { SlotPicker } from "@/components/orders/SlotPicker";
import { inputCls, labelCls } from "@/components/admin/ui";

type Coverage = { served: boolean; zone_name?: string; reason?: string };

export function BookingForm() {
  const router = useRouter();
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [slot, setSlot] = useState<string | null>(null);

  function locate() {
    setErr(null);
    setCoverage(null);
    if (!navigator.geolocation) return setErr("Your browser cannot share its location. Try another browser.");
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(async (p) => {
      const here = { lat: p.coords.latitude, lng: p.coords.longitude };
      setPos(here);
      const { data, error } = await createClient().rpc("quote_pickup", { _lat: here.lat, _lng: here.lng });
      setLocBusy(false);
      if (error) return setErr("We could not check service coverage. Please try again.");
      setCoverage(data as unknown as Coverage);
    }, (e) => {
      setLocBusy(false);
      if (e.code === e.PERMISSION_DENIED) setErr("Location access is blocked. Allow location access for this site in your browser settings, then try again.");
      else if (e.code === e.POSITION_UNAVAILABLE) setErr("Your device could not determine its location. Check that Location Services are on and try again.");
      else if (e.code === e.TIMEOUT) setErr("Finding your location took too long. Please try again.");
      else setErr("We could not get your location. Check your browser location permission and try again.");
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pos || !coverage?.served) return;
    if (when === "later" && !slot) { setErr("Choose a day and a time, or pick As soon as possible."); return; }
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    const r = await bookPickup({ ...pos, address: String(f.get("address") ?? ""), notes: String(f.get("notes") ?? ""), slot: when === "later" ? slot : null });
    if (r.ok && r.id) { router.push(`/orders/${r.id}`); return; }
    setBusy(false);
    setErr(r.message);
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {err && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      <div className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">1. Pickup location</h2>
        <p className="text-sm text-ink-soft">Pickup is included with your active monthly plan. There is no transport payment when you book.</p>
        <button type="button" className="btn-secondary" onClick={locate} disabled={locBusy}>{locBusy ? "Checking service area…" : pos ? "Check location again" : "Use my current location"}</button>
        {pos && <p className="text-xs text-ink-mute">Location captured. We will use these coordinates for service-area verification.</p>}
        {coverage && !coverage.served && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">We do not pick up from this area yet. <a className="font-semibold underline" href="/#coverage">Join the waitlist</a>.</p>}
        {coverage?.served && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Pickup is available in <strong>{coverage.zone_name ?? "your area"}</strong>. Your plan covers the remaining monthly allowance. Any pieces above it will be billed online after the agent counts them.</p>}
      </div>
      {coverage?.served && (
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
          <button className="btn-primary w-full sm:w-auto" disabled={busy || !pos || (when === "later" && !slot)}>{busy ? "Sending request…" : "Request pickup"}</button>
          <p className="text-sm text-ink-soft">Your request will be created as awaiting agent assignment. No payment is taken at booking.</p>
        </>
      )}
    </form>
  );
}
