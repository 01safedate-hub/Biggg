"use client";

import { useState } from "react";
import { markRefundPaid, retryEmail, saveZone, savePricing } from "@/app/admin/ops-actions";
import { toKobo } from "@/lib/money";
import { inputCls, labelCls } from "./ui";

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

export function ZoneRow({ z, parent }: { z: { id: string; name: string; kind: string; is_live: boolean; radius_m: number | null; centre_lat: number | null; centre_lng: number | null }; parent: string | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<R | null>(null);
  return (
    <form className="space-y-3 p-4" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const num = (id: string) => { const t = String(f.get(id) ?? "").trim(); return t === "" ? null : Number(t); };
      const lat = num("lat"), lng = num("lng"), rad = num("rad");
      if ([lat, lng, rad].some((x) => x != null && Number.isNaN(x))) return setMsg({ ok: false, message: "Use numbers only." });
      setBusy(true); setMsg(null);
      const r = await saveZone(z.id, { is_live: f.get("live") === "on", radius_m: rad, centre_lat: lat, centre_lng: lng });
      setBusy(false); setMsg(r);
    }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{z.name} <span className="text-xs font-normal text-ink-mute">{z.kind}{parent ? ` in ${parent}` : ""}</span></p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="live" defaultChecked={z.is_live} /> We pick up here</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <input name="lat" aria-label="Centre latitude" placeholder="Latitude" defaultValue={z.centre_lat ?? ""} className="rounded-md border border-line px-3 py-2 text-sm" />
        <input name="lng" aria-label="Centre longitude" placeholder="Longitude" defaultValue={z.centre_lng ?? ""} className="rounded-md border border-line px-3 py-2 text-sm" />
        <input name="rad" aria-label="Radius in metres" placeholder="Radius (m)" defaultValue={z.radius_m ?? ""} className="rounded-md border border-line px-3 py-2 text-sm" />
        <div className="flex items-center gap-2"><button className="btn-secondary !px-3 !py-2" disabled={busy}>Save</button>
          {z.centre_lat != null && z.centre_lng != null && <a className="text-xs underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${z.centre_lat},${z.centre_lng}`}>Check on map</a>}</div>
      </div>
      <Msg m={msg} />
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
