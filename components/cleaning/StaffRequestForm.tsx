"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, labelCls } from "@/components/admin/ui";
import { HOME_KIND_LABEL, SERVICE_LABEL } from "@/lib/cleaning";
import { staffCreateRequest } from "@/app/staff/(app)/cleaning/actions";
import { CustomerPicker, LocationPick, type PickedCustomer } from "./StaffPickers";
import { Msg, type R } from "./shared";

export function StaffRequestForm({ canLink }: { canLink: boolean }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true); setM(null);
    const r = await staffCreateRequest({
      customer_id: customer?.id ?? null,
      contact_name: customer ? null : g("contact_name"), contact_phone: customer ? null : g("contact_phone"),
      source: g("source"), service: g("service"), wants_plan: f.get("wants_plan") === "on",
      address: g("address"), lat: customer ? lat : null, lng: customer ? lng : null,
      home_kind: g("home_kind"), bedrooms: g("bedrooms"), bathrooms: g("bathrooms"), details: g("details"), preferred: g("preferred"),
    });
    setBusy(false);
    if (!r.ok || !r.id) { setM(r); return; }
    router.push(`/staff/cleaning/requests/${r.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Msg m={m} />
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Customer</h2>
        {canLink ? <CustomerPicker value={customer} onChange={setCustomer} /> : <p className="text-xs text-ink-mute">A secretary or admin links the customer account later. Enter a name and phone now.</p>}
        {!customer && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelCls} htmlFor="contact_name">Name</label><input id="contact_name" name="contact_name" required minLength={2} maxLength={80} className={inputCls} /></div>
            <div><label className={labelCls} htmlFor="contact_phone">Phone</label><input id="contact_phone" name="contact_phone" required minLength={10} maxLength={20} className={inputCls} /></div>
          </div>
        )}
        <div><label className={labelCls} htmlFor="source">How did they reach us?</label>
          <select id="source" name="source" className={inputCls} defaultValue="call"><option value="call">Phone call</option><option value="whatsapp">WhatsApp</option><option value="walk_in">Walked into the hub</option></select></div>
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Job</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls} htmlFor="service">Service</label><select id="service" name="service" className={inputCls}>{Object.entries(SERVICE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className={labelCls} htmlFor="home_kind">Type of place</label><select id="home_kind" name="home_kind" className={inputCls} defaultValue="flat">{Object.entries(HOME_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className={labelCls} htmlFor="bedrooms">Bedrooms</label><input id="bedrooms" name="bedrooms" type="number" min={0} max={30} className={inputCls} /></div>
          <div><label className={labelCls} htmlFor="bathrooms">Toilets and bathrooms</label><input id="bathrooms" name="bathrooms" type="number" min={0} max={30} className={inputCls} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="wants_plan" /> Interested in a monthly plan</label>
        <div><label className={labelCls} htmlFor="details">Notes from the call</label><textarea id="details" name="details" rows={3} maxLength={1000} className={inputCls} /></div>
        <div><label className={labelCls} htmlFor="preferred">Preferred day or time</label><input id="preferred" name="preferred" maxLength={200} className={inputCls} /></div>
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Address</h2>
        <div><label className={labelCls} htmlFor="address">House number, street and landmark</label><input id="address" name="address" maxLength={300} className={inputCls} /></div>
        {customer ? <LocationPick lat={lat} lng={lng} onPick={(a, b) => { setLat(a); setLng(b); }} /> : <p className="text-xs text-ink-mute">The map pin is saved once a customer is linked. You can add it on the request page.</p>}
      </section>
      <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save request"}</button>
    </form>
  );
}
