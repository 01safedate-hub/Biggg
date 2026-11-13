"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputCls, labelCls } from "@/components/admin/ui";
import { CLEANING_HOTLINE, CLEANING_WHATSAPP, HOME_KIND_LABEL, SERVICE_LABEL, nairaK } from "@/lib/cleaning";
import { createCleaningRequest } from "@/app/cleaning/actions";
import { Msg, PhotoUpload, type R } from "./shared";

type Check = { served: boolean; reason?: string; zone_name?: string; distance_km?: number; fare_kobo?: number; full_fare_kobo?: number; waived_kobo?: number; inspection_fee_kobo?: number };
type Property = { id: string; address: string; kind: string };

export function RequestForm({ userId, properties, initialService, initialPlan }: { userId: string; properties: Property[]; initialService: string; initialPlan: boolean }) {
  const router = useRouter();
  const [service, setService] = useState(SERVICE_LABEL[initialService] ? initialService : "standard");
  const [wantsPlan, setWantsPlan] = useState(initialPlan);
  const [propertyId, setPropertyId] = useState<string>(properties[0]?.id ?? "");
  const [useNew, setUseNew] = useState(properties.length === 0);
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);

  function locate() {
    setM(null); setCheck(null);
    if (!navigator.geolocation) { setM({ ok: false, message: "Your browser cannot share its location. Try another browser, or call us." }); return; }
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(async (p) => {
      const here = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
      if (!Number.isFinite(here.accuracy) || here.accuracy > 1000) {
        setLocBusy(false);
        setM({ ok: false, message: "Your location is not precise enough. Turn on precise location, move near a window and try again. Please do this at the place to be cleaned." });
        return;
      }
      setPos(here);
      const { data, error } = await createClient().rpc("cleaning_check_address" as never, { _lat: here.lat, _lng: here.lng } as never);
      setLocBusy(false);
      if (error) { setM({ ok: false, message: "We could not check this location. Please try again." }); return; }
      setCheck(data as unknown as Check);
    }, () => {
      setLocBusy(false);
      setM({ ok: false, message: "We could not get your location. Allow location access for this site and try again." });
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    if (useNew && (!pos || !check?.served)) { setM({ ok: false, message: "Use your location at the place to be cleaned first." }); return; }
    if (!useNew && !propertyId) { setM({ ok: false, message: "Choose an address." }); return; }
    const num = (k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : Math.max(0, Math.min(30, Math.round(Number(v)))); };
    setBusy(true); setM(null);
    const r = await createCleaningRequest({
      service, wants_plan: wantsPlan,
      property_id: useNew ? null : propertyId, lat: useNew ? pos?.lat : null, lng: useNew ? pos?.lng : null,
      address: String(f.get("address") ?? ""), home_kind: String(f.get("home_kind") ?? "flat"),
      bedrooms: num("bedrooms"), bathrooms: num("bathrooms"),
      details: String(f.get("details") ?? ""), preferred: String(f.get("preferred") ?? ""), photos,
    });
    setBusy(false);
    if (!r.ok) { setM(r); return; }
    router.push(`/cleaning/my?requested=${r.requestNo ?? ""}`);
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Msg m={m} />
      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">1. What do you need?</h2>
        <div>
          <label htmlFor="service" className={labelCls}>Type of cleaning</label>
          <select id="service" className={inputCls} value={service} onChange={(e) => setService(e.target.value)}>
            {Object.entries(SERVICE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={wantsPlan} onChange={(e) => setWantsPlan(e.target.checked)} />
          <span>I want regular cleaning on a monthly plan (2 or 4 visits a month, or custom). Add laundry pickup to make it <strong>Home Complete</strong>.</span>
        </label>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">2. Where?</h2>
        {properties.length > 0 && (
          <div className="space-y-2">
            {properties.map((p) => (
              <label key={p.id} className="flex items-start gap-3 text-sm">
                <input type="radio" name="prop" className="mt-1" checked={!useNew && propertyId === p.id} onChange={() => { setUseNew(false); setPropertyId(p.id); }} />
                <span>{p.address} <span className="text-ink-mute">({HOME_KIND_LABEL[p.kind] ?? p.kind})</span></span>
              </label>
            ))}
            <label className="flex items-start gap-3 text-sm"><input type="radio" name="prop" className="mt-1" checked={useNew} onChange={() => setUseNew(true)} /> <span>A new address</span></label>
          </div>
        )}
        {useNew && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">Stand at the place to be cleaned and tap the button. We use it to check we cover the area and to work out the crew transport.</p>
            <button type="button" className="btn-secondary" onClick={locate} disabled={locBusy}>{locBusy ? "Checking…" : pos ? "Check location again" : "Use my current location"}</button>
            {check && !check.served && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{check.reason === "location_required" ? "We need your location." : "We do not cover this area yet."} Call or WhatsApp {CLEANING_HOTLINE} and we will see what we can do.</p>}
            {check?.served && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 space-y-1">
                <p>We cover <strong>{check.zone_name ?? "your area"}</strong>.</p>
                <p>Inspection fee if we visit to measure: <strong>{nairaK(check.inspection_fee_kobo)}</strong>. It is credited to your clean when you book. For small homes we can often quote from photos instead, with no fee.</p>
                <p>Crew transport per visit: <strong>{Number(check.fare_kobo ?? 0) === 0 ? "Free" : nairaK(check.fare_kobo)}</strong>{Number(check.waived_kobo ?? 0) > 0 ? " (free transport offer)" : ""}.</p>
              </div>
            )}
            {check?.served && <div><label htmlFor="address" className={labelCls}>House number, street and landmark</label><input id="address" name="address" required minLength={5} maxLength={300} className={inputCls} /></div>}
          </div>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">3. About the place</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label htmlFor="home_kind" className={labelCls}>Type</label><select id="home_kind" name="home_kind" className={inputCls} defaultValue={service === "office" ? "office" : "flat"}>{Object.entries(HOME_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label htmlFor="bedrooms" className={labelCls}>Bedrooms</label><input id="bedrooms" name="bedrooms" type="number" min={0} max={30} className={inputCls} /></div>
          <div><label htmlFor="bathrooms" className={labelCls}>Toilets and bathrooms</label><input id="bathrooms" name="bathrooms" type="number" min={0} max={30} className={inputCls} /></div>
        </div>
        <div><label htmlFor="details" className={labelCls}>Tell us about the job (optional)</label><textarea id="details" name="details" rows={3} maxLength={1000} className={inputCls} placeholder="For example: just finished painting, need the fridge and windows done, tiles are stained." /></div>
        <div><label htmlFor="preferred" className={labelCls}>When would you like it done? (optional)</label><input id="preferred" name="preferred" maxLength={200} className={inputCls} placeholder="For example: next Saturday morning" /></div>
        <div className="space-y-1">
          <p className={labelCls}>Photos (optional, helps us quote without a visit)</p>
          <PhotoUpload folder={`requests/${userId}`} value={photos} onChange={setPhotos} />
        </div>
      </section>

      <div className="space-y-2">
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
        <p className="text-xs text-ink-mute">No payment now. We call you to arrange a quote. Prefer to talk? Call {CLEANING_HOTLINE} or <a className="underline" href={CLEANING_WHATSAPP}>WhatsApp us</a>.</p>
      </div>
    </form>
  );
}
