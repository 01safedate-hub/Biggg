"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { bookPickup, bookOneTimePickup } from "@/app/orders/actions";
import { createClient } from "@/lib/supabase/client";
import { SlotPicker } from "@/components/orders/SlotPicker";
import { inputCls, labelCls } from "@/components/admin/ui";

const PAYMENT_LOGOS: Record<PaymentProvider, { src: string; alt: string }> = {
  paystack: { src: "https://commons.wikimedia.org/wiki/Special:FilePath/Paystack_Logo.png", alt: "Paystack logo" },
  flutterwave: { src: "https://commons.wikimedia.org/wiki/Special:FilePath/Flutterwave_Logo.png", alt: "Flutterwave logo" },
};

type Coverage = { served: boolean; zone_name?: string; reason?: string; total_fare_kobo?: number; pickup_fare_kobo?: number; delivery_fare_kobo?: number; extra_distance_fare_kobo?: number; round_trip_km?: number; included_round_trip_km?: number; extra_distance_km?: number; distance_km?: number; };
type PaymentProvider = "paystack" | "flutterwave";

export function BookingForm({ mode = "subscription" }: { mode?: "subscription" | "one_time" }) {
  const router = useRouter();
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [provider, setProvider] = useState<PaymentProvider>("paystack");
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [slot, setSlot] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "one_time") return;
    let live = true;
    createClient().rpc("active_payment_providers" as never).then(({ data, error }) => {
      if (!live || error) return;
      const available = ((data ?? []) as string[]).filter((x): x is PaymentProvider => x === "paystack" || x === "flutterwave");
      setProviders(available);
      if (available.length) setProvider(available[0]);
    });
    return () => { live = false; };
  }, [mode]);

  function locate() {
    setErr(null);
    setCoverage(null);
    if (!navigator.geolocation) return setErr("Your browser cannot share its location. Try another browser.");
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(async (p) => {
      const here = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
      setPos(here);
      if (!Number.isFinite(here.accuracy) || here.accuracy > 1000) {
        setLocBusy(false);
        setPos(null);
        return setErr("Your location is too imprecise to calculate a reliable transport fare (accuracy worse than 1 km). Move near a window or outdoors, turn on precise location, and try again.");
      }
      const { data, error } = await createClient().rpc((mode === "one_time" ? "quote_one_time_pickup" : "quote_pickup") as never, { _lat: here.lat, _lng: here.lng } as never);
      setLocBusy(false);
      if (error) return setErr("We could not check service coverage. Please try again.");
      const quote = data as unknown as Coverage;
      if (mode === "one_time" && quote.served && Number(quote.round_trip_km ?? 0) > 1000) {
        setCoverage(null);
        return setErr("We could not verify this distance. Please check your pickup location and try again, or contact support before paying.");
      }
      setCoverage(quote);
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
    if (mode === "one_time" && providers.length === 0) { setErr("Online payment is temporarily unavailable. Please try again later."); return; }
    if (when === "later" && !slot) { setErr("Choose a day and a time, or pick As soon as possible."); return; }
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    const values = { ...pos, address: String(f.get("address") ?? ""), notes: String(f.get("notes") ?? ""), slot: when === "later" ? slot : null };
    try {
      const r = mode === "one_time" ? await bookOneTimePickup(values) : await bookPickup(values);
      if (!r.ok || !r.id) {
        setBusy(false);
        setErr(r.message || "We couldn't create your pickup request. Please check your details and try again.");
        return;
      }
      if (mode === "one_time") {
        const { startPayment } = await import("@/app/orders/actions");
        const providerResult = await startPayment(r.id, "pickup_fare", provider);
        if (providerResult.ok && providerResult.url) { window.location.assign(providerResult.url); return; }
        setBusy(false);
        setErr(providerResult.message || "Your pickup is saved as awaiting payment. Open My Orders to retry payment.");
        router.push(`/orders/${r.id}`);
        return;
      }
      router.push(`/orders/${r.id}`);
    } catch (cause) {
      setBusy(false);
      console.error("Pickup request submission failed", cause);
      setErr("We couldn't submit your pickup request. Your connection may have dropped. Refresh the page and check My Orders before retrying, so you don't create a duplicate request.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {err && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      <div className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">1. Pickup location</h2>
        <p className="text-sm text-ink-soft">{mode === "one_time" ? "Transport is prepaid online before dispatch. Laundry charges are separate and will be billed after garment counting." : "Pickup is included with your active monthly plan. There is no transport payment when you book."}</p>
        <button type="button" className="btn-secondary" onClick={locate} disabled={locBusy}>{locBusy ? "Checking service area…" : pos ? "Check location again" : "Use my current location"}</button>
        {pos && <p className="text-xs text-ink-mute">Location captured. Reported GPS accuracy: approximately {Math.round(pos.accuracy)} m. We use these coordinates for service-area verification.</p>}
        {coverage && !coverage.served && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">We do not pick up from this area yet. <a className="font-semibold underline" href="/#coverage">Join the waitlist</a>.</p>}
        {coverage?.served && (mode === "one_time" ? <div className="rounded-md border border-line p-4 text-sm"><p>Pickup is available in <strong>{coverage.zone_name ?? "your area"}</strong>.</p><dl className="mt-3 space-y-2"><div className="flex justify-between gap-3"><dt>Pickup transport</dt><dd>₦{((coverage.pickup_fare_kobo ?? 180000)/100).toLocaleString("en-NG")}</dd></div><div className="flex justify-between gap-3"><dt>Delivery transport</dt><dd>₦{((coverage.delivery_fare_kobo ?? 180000)/100).toLocaleString("en-NG")}</dd></div>{Number(coverage.extra_distance_fare_kobo ?? 0)>0 && <div className="flex justify-between gap-3"><dt>Extra distance ({coverage.extra_distance_km ?? 0} km)</dt><dd>₦{(Number(coverage.extra_distance_fare_kobo)/100).toLocaleString("en-NG")}</dd></div>}<div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Pay now for transport</dt><dd>₦{(Number(coverage.total_fare_kobo ?? 0)/100).toLocaleString("en-NG")}</dd></div><p className="text-xs text-ink-mute">Includes up to {coverage.included_round_trip_km ?? 100} km round-trip journey. Laundry charges are billed after counting.</p></dl></div> : <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Pickup is available in <strong>{coverage.zone_name ?? "your area"}</strong>. Your plan covers the remaining monthly allowance. Any pieces above it will be billed online after the agent counts them.</p>)}
      </div>
      {coverage?.served && (
        <>
          <div className="card space-y-4 p-5">
            <h2 className="text-lg font-semibold">2. Address details</h2>
            <div><label htmlFor="address" className={labelCls}>House number, street and landmark</label><input id="address" name="address" required minLength={5} maxLength={300} className={inputCls} /></div>
            <div><label htmlFor="notes" className={labelCls}>Anything the agent should know? (optional)</label><textarea id="notes" name="notes" maxLength={500} rows={2} className={inputCls} /></div>
          </div>
          {mode === "one_time" && (
            <div className="card space-y-3 p-5">
              <h2 className="text-lg font-semibold">3. Payment method</h2>
              <p className="text-sm text-ink-soft">Choose how you want to pay. Your selected provider will open after you request pickup.</p>
              {providers.length === 0 ? (
                <button type="button" className="btn-secondary" onClick={async () => {
                  const { data, error } = await createClient().rpc("active_payment_providers" as never);
                  if (error) { setErr("We could not load payment methods. Please try again."); return; }
                  const available = ((data ?? []) as string[]).filter((x): x is PaymentProvider => x === "paystack" || x === "flutterwave");
                  setProviders(available);
                  if (available.length) setProvider(available[0]);
                }}>Load payment methods</button>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {providers.map((p) => <label key={p} className="flex cursor-pointer items-center gap-2 rounded-md border border-line p-3">
                    <input type="radio" name="payment_provider" value={p} checked={provider === p} onChange={() => setProvider(p)} />
                    <span className="flex min-w-32 items-center gap-3"><img src={PAYMENT_LOGOS[p].src} alt={PAYMENT_LOGOS[p].alt} className="h-7 w-28 object-contain" loading="lazy" /><span className="sr-only">{p === "paystack" ? "Paystack" : "Flutterwave"}</span></span>
                  </label>)}
                </div>
              )}
            </div>
          )}
          <div className="card space-y-4 p-5">
            <h2 className="text-lg font-semibold">{mode === "one_time" ? "4." : "3."} When should we come?</h2>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="When">
              <button type="button" role="radio" aria-checked={when === "now"} onClick={() => { setWhen("now"); setSlot(null); }} className={`rounded-md border px-4 py-2 text-sm ${when === "now" ? "border-brand bg-brand-tint font-semibold text-brand-dark" : "border-line"}`}>As soon as possible</button>
              <button type="button" role="radio" aria-checked={when === "later"} onClick={() => setWhen("later")} className={`rounded-md border px-4 py-2 text-sm ${when === "later" ? "border-brand bg-brand-tint font-semibold text-brand-dark" : "border-line"}`}>Choose a time</button>
            </div>
            {when === "later" && <SlotPicker value={slot} onChange={setSlot} />}
          </div>
          <button className="btn-primary w-full sm:w-auto" disabled={busy || !pos || (when === "later" && !slot)}>{busy ? "Sending request…" : "Request pickup"}</button>
          <p className="text-sm text-ink-soft">{mode === "one_time" ? "After you request pickup, we will open your chosen payment provider. The pickup is not confirmed until payment is verified." : "Your request will be created as awaiting agent assignment. No payment is taken at booking."}</p>
        </>
      )}
    </form>
  );
}
