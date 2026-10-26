"use client";

import { useState } from "react";
import { markRefundPaid, retryEmail, saveServiceArea, saveZone, savePricing, createZone } from "@/app/admin/ops-actions";
import { toKobo } from "@/lib/money";
import { inputCls, labelCls } from "./ui";
import ZoneMapPicker from "./ZoneMapPicker";

type R = { ok: boolean; message: string };
const Msg = ({ m }: { m: R | null }) => m ? <p role={m.ok ? "status" : "alert"} className={`rounded-md border p-2 text-sm ${m.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{m.message}</p> : null;
const n = (k: number) => String(k / 100);

export type PricingValues = { pickupRate: number; pickupMin: number; deliveryRate: number; deliveryMin: number; roundTo: number; open: string; close: string; eta: number };

export function PricingForm({ v }: { v: PricingValues }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  const field = (id: string, label: string, val: string, hint?: string) => (
    <div><label htmlFor={id} className={labelCls}>{label}</label><input id={id} name={id} inputMode="decimal" required defaultValue={val} className={inputCls} />{hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}</div>
  );
  return (
    <form className="space-y-6" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const k = (id: string) => toKobo(String(f.get(id) ?? ""));
      const vals = { pickup_rate_per_km_kobo: k("pr"), pickup_min_fare_kobo: k("pm"), delivery_rate_per_km_kobo: k("dr"), delivery_min_fare_kobo: k("dm"), round_to_kobo: k("rt") };
      if (Object.values(vals).some((x) => x == null)) return setMsg({ ok: false, message: "Enter every amount in naira, for example 150 or 150.50." });
      setBusy(true); setMsg(null);
      const r = await savePricing({ ...(vals as Record<string, number>), opening_time: String(f.get("open")), closing_time: String(f.get("close")), agent_eta_minutes: Number(f.get("eta")) });
      setBusy(false); setMsg(r);
      if (r.ok) { setLive(f.get("live") === "on"); setAutoLive(f.get("auto") === "on"); }
    }}>
      <Msg m={msg} />
      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">Transport fares</h2>
        <p className="text-sm text-ink-soft">Fare = distance to the customer × 2 (return trip) × rate, never below the minimum, rounded to the step.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("pr", "Pickup: rate per km (₦)", n(v.pickupRate))}
          {field("pm", "Pickup: minimum fare (₦)", n(v.pickupMin))}
          {field("dr", "Delivery: rate per km (₦)", n(v.deliveryRate))}
          {field("dm", "Delivery: minimum fare (₦)", n(v.deliveryMin))}
          {field("rt", "Round fares to the nearest (₦)", n(v.roundTo), "For example 50 rounds ₦1,234 to ₦1,250.")}
        </div>
      </section>
      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">Opening hours and agent time</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label htmlFor="open" className={labelCls}>Opens</label><input id="open" name="open" type="time" required defaultValue={v.open} className={inputCls} /></div>
          <div><label htmlFor="close" className={labelCls}>Closes</label><input id="close" name="close" type="time" required defaultValue={v.close} className={inputCls} /></div>
          <div><label htmlFor="eta" className={labelCls}>Agent arrives in (minutes)</label><input id="eta" name="eta" inputMode="numeric" required defaultValue={v.eta} className={inputCls} /></div>
        </div>
        <p className="text-xs text-ink-mute">Bookings made while closed are scheduled for the next opening time. The arrival time is what customers are promised on the website.</p>
      </section>
      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Save fares and hours"}</button>
    </form>
  );
}

type ZoneRowData = { id: string; name: string; kind: string; is_live: boolean; radius_m: number | null; centre_lat: number | null; centre_lng: number | null; auto_live: boolean; coords_approx: boolean; postal_code: string | null; note: string | null; villages: string[] };

export function ZoneCreateForm() {
  const [name, setName] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState(1500);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  const locate = () => {
    if (!navigator.geolocation) return setMsg({ ok: false, message: "Location is not supported by this browser. Choose a point on the map." });
    setLocating(true); setMsg(null);
    navigator.geolocation.getCurrentPosition((p) => {
      setLat(p.coords.latitude); setLng(p.coords.longitude); setLocating(false);
      setMsg({ ok: true, message: "Location found. Check the map and save when ready." });
    }, () => { setLocating(false); setMsg({ ok: false, message: "Location unavailable. Allow location permission or choose a point on the map." }); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };
  return <form className="card space-y-4 p-5" onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await createZone({ name, centre_lat: lat, centre_lng: lng, radius_m: radius });
    setBusy(false); setMsg(r);
    if (r.ok) { setName(""); setLat(null); setLng(null); setRadius(1500); }
  }}>
    <div><h2 className="text-lg font-semibold">Add a coverage zone</h2><p className="mt-1 text-sm text-ink-soft">Pick a centre on the map or use your current location. New zones are created switched off so you can review them before accepting orders there.</p></div>
    <label className={labelCls}>Zone name<input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New neighbourhood" className={inputCls} /></label>
    <ZoneMapPicker lat={lat} lng={lng} radiusM={radius} onPick={(a,b) => { setLat(a); setLng(b); }} />
    <div className="grid gap-3 sm:grid-cols-3">
      <label className={labelCls}>Latitude<input value={lat ?? ""} onChange={(e) => setLat(e.target.value === "" ? null : Number(e.target.value))} inputMode="decimal" className={inputCls} placeholder="Choose on map" /></label>
      <label className={labelCls}>Longitude<input value={lng ?? ""} onChange={(e) => setLng(e.target.value === "" ? null : Number(e.target.value))} inputMode="decimal" className={inputCls} placeholder="Choose on map" /></label>
      <label className={labelCls}>Radius (metres)<input type="number" min={200} max={50000} step={100} required value={radius} onChange={(e) => setRadius(Number(e.target.value))} className={inputCls} /></label>
    </div>
    <div className="flex flex-wrap items-center gap-3"><button type="button" className="btn-secondary" disabled={locating} onClick={locate}>{locating ? "Finding location…" : "Use my current location"}</button><button type="submit" className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create zone (off)"}</button></div>
    <Msg m={msg} />
  </form>;
}

export function ZoneRow({ z, parent, km }: { z: ZoneRowData; parent: string | null; km: number | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  const [lat, setLat] = useState(z.centre_lat);
  const [lng, setLng] = useState(z.centre_lng);
  const [radius, setRadius] = useState(z.radius_m);
  const [locating, setLocating] = useState(false);
  const [autoLive, setAutoLive] = useState(z.auto_live);
  const [live, setLive] = useState(z.is_live);
  const locate = () => {
    if (!navigator.geolocation) return setMsg({ ok: false, message: "This browser does not support location. Choose a point on the map instead." });
    setLocating(true); setMsg(null);
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude); setLng(pos.coords.longitude);
      setLocating(false);
      setMsg({ ok: true, message: "Location found. Save the zone to keep these coordinates." });
    }, (err) => {
      setLocating(false);
      setMsg({ ok: false, message: err.code === err.PERMISSION_DENIED ? "Location permission was denied. Allow location access in your browser or choose a point on the map." : "Could not determine your location. Try again or choose a point on the map." });
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };
  return (
    <form className="space-y-3 p-4" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const rad = radius == null ? null : Number(radius);
      if ([lat, lng, rad].some((x) => x != null && !Number.isFinite(x))) return setMsg({ ok: false, message: "Use valid numeric coordinates and radius." });
      setBusy(true); setMsg(null);
      const r = await saveZone(z.id, { is_live: f.get("live") === "on", radius_m: rad, centre_lat: lat, centre_lng: lng, auto_live: f.get("auto") === "on" });
      setBusy(false); setMsg(r);
    }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{z.name} <span className="text-xs font-normal text-ink-mute">{z.kind}{parent ? ` in ${parent}` : ""}{z.postal_code ? ` · ${z.postal_code}` : ""}</span></p>
          {(z.note || z.villages.length > 0) && <p className="text-xs text-ink-soft">{z.note}{z.note && z.villages.length > 0 ? " · " : ""}{z.villages.length > 0 ? `${z.villages.length} villages` : ""}</p>}
          {z.centre_lat == null && z.kind === "area" && <p className="text-xs text-amber-700">No map point yet. Add one to switch it on.</p>}
          {z.coords_approx && <p className="text-xs text-amber-700">Map point is approximate. Check it on the map and save to confirm.</p>}
          {km != null && <p className="text-xs text-ink-mute">{km.toFixed(1)} km from the hub</p>}
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="live" checked={live} onChange={(e) => setLive(e.target.checked)} /> We pick up here</label>
          <label className="flex items-center gap-2 text-xs text-ink-soft"><input type="checkbox" name="auto" checked={autoLive} onChange={(e) => setAutoLive(e.target.checked)} /> Switch on automatically by distance</label>
        </div>
      </div>
      {autoLive ? <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">Automatic mode controls whether this zone is live based on its distance from the hub. If the zone is outside the configured service distance, checking “We pick up here” may not activate it. To deliberately serve a farther area, turn off automatic mode, check “We pick up here”, then press “Save zone”. Only do this when operations can serve the area.</p> : <p className="rounded-md bg-sky-50 p-3 text-xs text-sky-900">Manual mode: this zone will use the “We pick up here” setting you save below. Confirm the team can serve this area before enabling it.</p>}
      <ZoneMapPicker lat={lat} lng={lng} radiusM={radius} onPick={(a, b) => { setLat(a); setLng(b); }} />
      <div className="grid gap-3 sm:grid-cols-4">
        <input name="lat" aria-label="Centre latitude" placeholder="Latitude" value={lat ?? ""} onChange={(e) => setLat(e.target.value === "" ? null : Number(e.target.value))} className="rounded-md border border-line px-3 py-2 text-sm" />
        <input name="lng" aria-label="Centre longitude" placeholder="Longitude" value={lng ?? ""} onChange={(e) => setLng(e.target.value === "" ? null : Number(e.target.value))} className="rounded-md border border-line px-3 py-2 text-sm" />
        <input name="rad" aria-label="Radius in metres" placeholder="Radius (m)" value={radius ?? ""} onChange={(e) => setRadius(e.target.value === "" ? null : Number(e.target.value))} className="rounded-md border border-line px-3 py-2 text-sm" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary !px-3 !py-2" disabled={locating} onClick={locate}>{locating ? "Finding…" : "Use my location"}</button>
          <button type="submit" className="btn-secondary !px-3 !py-2" disabled={busy}>{busy ? "Saving…" : "Save zone"}</button>
          {lat != null && lng != null && <a className="text-xs underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${lat},${lng}`}>Open map</a>}
        </div>
      </div>
      <Msg m={msg} />
    </form>
  );
}

export function ServiceDepthForm({ name, lat, lng, multiplier, depthKm }: { name: string; lat: number; lng: number; multiplier: number; depthKm: number | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  return (
    <form className="card space-y-3 p-5" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      setBusy(true); setMsg(null);
      const r = await saveServiceArea({ name: String(f.get("n") ?? ""), lat: Number(f.get("la")), lng: Number(f.get("lo")), multiplier: Number(f.get("m")) });
      setBusy(false); setMsg(r);
    }}>
      <div>
        <h2 className="text-lg font-semibold">Service depth: {depthKm != null ? `${depthKm.toFixed(1)} km around the hub` : "not set"}</h2>
        <p className="text-sm text-ink-soft">The depth is the distance from the hub (Ifite) to the reference place below, times the multiplier. Every place with a map point inside that distance is switched on automatically, and an address anywhere inside it can be served. Change the reference place or the multiplier to widen or narrow the area.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-sm">Reference place<input name="n" defaultValue={name} required maxLength={60} className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" /></label>
        <label className="block text-sm">Latitude<input name="la" defaultValue={lat} required inputMode="decimal" className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" /></label>
        <label className="block text-sm">Longitude<input name="lo" defaultValue={lng} required inputMode="decimal" className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" /></label>
        <label className="block text-sm">Multiplier<input name="m" defaultValue={multiplier} required inputMode="decimal" className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm" /></label>
      </div>
      <p className="text-xs text-ink-mute">Check the reference place on Google Maps (right-click the spot and copy the two numbers). The starting point for Amawbia is approximate.</p>
      <div className="flex items-center gap-3"><button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Save and recalculate"}</button><Msg m={msg} /></div>
    </form>
  );
}

export function RetryButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  return <span><button className="btn-secondary !px-3 !py-1" disabled={busy} onClick={async () => { setBusy(true); setMsg(await retryEmail(id)); setBusy(false); }}>Send again</button>{msg && <span role={msg.ok ? "status" : "alert"} className={`ml-2 text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.message}</span>}</span>;
}

export function RefundButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-secondary !px-3 !py-1" disabled={busy} onClick={async () => {
        const note = window.prompt("How did you send the money? (for example: bank transfer, reference 12345)") ?? "";
        if (note.trim().length < 3) return;
        setBusy(true); setMsg(await markRefundPaid(id, note)); setBusy(false);
      }}>I have sent this refund</button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.message}</span>}
    </div>
  );
}
