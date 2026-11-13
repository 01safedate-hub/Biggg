"use client";

import { useState } from "react";
import ZoneMapPicker from "@/components/admin/ZoneMapPicker";
import { inputCls, labelCls } from "@/components/admin/ui";
import { addWalkinCustomer, findDeskCustomers } from "@/app/staff/(app)/ops-actions";

export type PickedCustomer = { id: string; name: string; phone: string | null };

// Finds an existing customer, or creates a walk-in customer record for people without an account.
export function CustomerPicker({ value, onChange }: { value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ id: string; name: string; phone: string | null; is_walk_in: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  async function search() {
    if (q.trim().length < 2) return;
    setBusy(true); setErr("");
    const r = await findDeskCustomers(q.trim());
    setBusy(false);
    if (!r.ok) setErr(r.message);
    setRows(r.rows);
  }
  async function add() {
    setBusy(true); setErr("");
    const r = await addWalkinCustomer(name, phone);
    setBusy(false);
    if (!r.ok || !r.id) { setErr(r.message); return; }
    onChange({ id: r.id, name: name.trim(), phone: phone.trim() });
    setAdding(false);
  }
  if (value) return <p className="text-sm">Customer: <strong>{value.name}</strong>{value.phone ? ` · ${value.phone}` : ""} <button type="button" className="ml-2 underline" onClick={() => onChange(null)}>Change</button></p>;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className={inputCls + " !mt-0"} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} placeholder="Search name or phone" />
        <button type="button" className="btn-secondary" disabled={busy} onClick={search}>{busy ? "…" : "Search"}</button>
      </div>
      {rows.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line text-sm">
          {rows.map((r) => <li key={r.id}><button type="button" className="w-full px-3 py-2 text-left hover:bg-canvas" onClick={() => onChange({ id: r.id, name: r.name, phone: r.phone })}>{r.name} {r.phone ? `· ${r.phone}` : ""} {r.is_walk_in ? <span className="text-xs text-ink-mute">(walk-in)</span> : null}</button></li>)}
        </ul>
      )}
      {!adding ? <button type="button" className="text-sm underline" onClick={() => setAdding(true)}>Customer has no account: add them</button> : (
        <div className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
          <input className={inputCls + " !mt-0"} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={inputCls + " !mt-0"} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button type="button" className="btn-secondary" disabled={busy} onClick={add}>Add</button>
        </div>
      )}
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
    </div>
  );
}

// Pin the exact location on a map, or use this phone's location when standing at the place.
export function LocationPick({ lat, lng, onPick }: { lat: number | null; lng: number | null; onPick: (lat: number, lng: number) => void }) {
  const [err, setErr] = useState("");
  function here() {
    setErr("");
    if (!navigator.geolocation) { setErr("This device cannot share its location."); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      if (p.coords.accuracy > 1000) { setErr("Location is not precise enough. Pin it on the map instead."); return; }
      onPick(p.coords.latitude, p.coords.longitude);
    }, () => setErr("Could not get this device's location. Pin it on the map."), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }
  return (
    <div className="space-y-2">
      <p className={labelCls}>Exact location</p>
      <p className="text-xs text-ink-soft">Tap the map where the building is. Ask the customer for a landmark, or send them a WhatsApp location request.</p>
      <ZoneMapPicker lat={lat} lng={lng} radiusM={40} onPick={onPick} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="btn-secondary" onClick={here}>I am at the place: use my location</button>
        {lat != null && lng != null && <span className="text-xs text-ink-mute">{lat.toFixed(5)}, {lng.toFixed(5)}</span>}
      </div>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
