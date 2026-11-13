"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, labelCls } from "@/components/admin/ui";
import { HOME_KIND_LABEL, SERVICE_LABEL, minutesLabel, nairaK } from "@/lib/cleaning";
import { bookInspection, deskPay, inspectionDone, quotePreview, quoteSave, quoteSend, updateRequest } from "@/app/staff/(app)/cleaning/actions";
import { CustomerPicker, LocationPick, type PickedCustomer } from "./StaffPickers";
import { Msg, PhotoUpload, type R } from "./shared";

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);
  async function run(fn: () => Promise<R>) {
    setBusy(true); setM(null);
    const r = await fn();
    setBusy(false); setM(r);
    if (r.ok) router.refresh();
    return r;
  }
  return { busy, m, run, setM };
}

// ---------- Customer and address ----------
export function LinkCustomer({ requestId, current, address, lat, lng, canLink, homeKind }: { requestId: string; current: PickedCustomer | null; address: string; lat: number | null; lng: number | null; canLink: boolean; homeKind: string | null }) {
  const { busy, m, run } = useRun();
  const [c, setC] = useState<PickedCustomer | null>(current);
  const [a, setA] = useState(address);
  const [pos, setPos] = useState<{ lat: number | null; lng: number | null }>({ lat, lng });
  const [kind, setKind] = useState(homeKind ?? "flat");
  return (
    <div className="space-y-3">
      {canLink ? <CustomerPicker value={c} onChange={setC} /> : c ? <p className="text-sm">Customer: <strong>{c.name}</strong></p> : <p className="text-sm text-amber-800">No customer account linked yet. Ask a secretary or admin to link one.</p>}
      <div><label className={labelCls}>Address</label><input className={inputCls} value={a} onChange={(e) => setA(e.target.value)} maxLength={300} /></div>
      <div><label className={labelCls}>Type of place</label><select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(HOME_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <LocationPick lat={pos.lat} lng={pos.lng} onPick={(x, y) => setPos({ lat: x, lng: y })} />
      <button type="button" className="btn-primary" disabled={busy || !c} onClick={() => run(() => updateRequest(requestId, { customer_id: c?.id, address: a, lat: pos.lat, lng: pos.lng, home_kind: kind }))}>{busy ? "Saving…" : "Save customer and address"}</button>
      {!c && <p className="text-xs text-ink-mute">A customer account is needed to quote and take payment. Walk-in customers can be added from the search.</p>}
      <Msg m={m} />
    </div>
  );
}

export function RequestStatus({ requestId, status }: { requestId: string; status: string }) {
  const { busy, m, run } = useRun();
  const [lost, setLost] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "new" && <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => updateRequest(requestId, { status: "contacted" }))}>Mark as called</button>}
        {!["accepted", "lost", "cancelled"].includes(status) && <button type="button" className="btn-secondary" onClick={() => setLost(!lost)}>Mark as lost</button>}
      </div>
      {lost && (
        <div className="flex flex-wrap gap-2">
          <select className={inputCls + " !mt-0 max-w-xs"} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Why?</option><option>Price too high</option><option>No answer after 3 calls</option><option>Went with someone else</option><option>Outside our area</option><option>Service we do not offer</option><option>Changed their mind</option>
          </select>
          <button type="button" className="btn-secondary" disabled={busy || !reason} onClick={() => run(() => updateRequest(requestId, { status: "lost", lost_reason: reason }))}>Save</button>
        </div>
      )}
      <Msg m={m} />
    </div>
  );
}

// ---------- Inspection ----------
export function BookInspection({ requestId, feeKobo, inspectors, hasCustomer }: { requestId: string; feeKobo: number; inspectors: { id: string; name: string }[]; hasCustomer: boolean }) {
  const { busy, m, run } = useRun();
  const [mode, setMode] = useState("onsite");
  const [at, setAt] = useState("");
  const [insp, setInsp] = useState("");
  const [waive, setWaive] = useState(false);
  const [why, setWhy] = useState("");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="radio" checked={mode === "onsite"} onChange={() => setMode("onsite")} /> Visit to inspect ({nairaK(feeKobo)} fee)</label>
        <label className="flex items-center gap-2"><input type="radio" checked={mode === "remote"} onChange={() => setMode("remote")} /> Quote from photos or video call (no fee)</label>
      </div>
      {mode === "onsite" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls}>Date and time</label><input type="datetime-local" className={inputCls} value={at} onChange={(e) => setAt(e.target.value)} /></div>
          <div><label className={labelCls}>Inspector</label><select className={inputCls} value={insp} onChange={(e) => setInsp(e.target.value)}><option value="">Choose later</option>{inspectors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> Skip the inspection fee</label>
          {waive && <div className="sm:col-span-2"><label className={labelCls}>Reason for skipping the fee</label><input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={200} placeholder="For example: returning customer, large office lead" /></div>}
          {!waive && !hasCustomer && <p className="text-xs text-amber-800 sm:col-span-2">Link a customer account first so they can pay the fee, or skip the fee.</p>}
        </div>
      )}
      <button type="button" className="btn-primary" disabled={busy || (mode === "onsite" && !at)} onClick={() => run(() => bookInspection(requestId, {
        mode, scheduled_for: mode === "onsite" && at ? new Date(`${at}:00+01:00`).toISOString() : null, inspector_id: insp || null, waive: mode === "onsite" && waive, waive_reason: why,
      }))}>{busy ? "Saving…" : mode === "remote" ? "Quote remotely" : "Book inspection"}</button>
      <Msg m={m} />
    </div>
  );
}

export function InspectionDone({ inspectionId, requestId, folder }: { inspectionId: string; requestId: string; folder: string }) {
  const { busy, m, run } = useRun();
  const [photos, setPhotos] = useState<string[]>([]);
  const [f, setF] = useState({ water: "", power: "", access: "", pets: "", notes: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-3 rounded-md border border-line p-3">
      <p className="text-sm font-medium">Record what you found</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={labelCls}>Water</label><input className={inputCls} value={f.water} onChange={set("water")} placeholder="Running tap / borehole / must buy" /></div>
        <div><label className={labelCls}>Power</label><input className={inputCls} value={f.power} onChange={set("power")} placeholder="NEPA / generator / none" /></div>
        <div><label className={labelCls}>Access</label><input className={inputCls} value={f.access} onChange={set("access")} placeholder="Gate, floor, parking, key holder" /></div>
        <div><label className={labelCls}>Pets</label><input className={inputCls} value={f.pets} onChange={set("pets")} /></div>
      </div>
      <div><label className={labelCls}>Notes for the quote (rooms, stains, paint, special items)</label><textarea className={inputCls} rows={3} value={f.notes} onChange={set("notes")} /></div>
      <PhotoUpload folder={folder} max={30} value={photos} onChange={setPhotos} label="Add inspection photos" />
      <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => inspectionDone(inspectionId, requestId, f, photos))}>{busy ? "Saving…" : "Inspection done"}</button>
      <Msg m={m} />
    </div>
  );
}

// ---------- Quote builder ----------
type Rate = { spaces: Record<string, { label: string; price_kobo: number; minutes: number }>; addons: Record<string, { label: string; price_kobo: number; minutes: number }>;
  services: Record<string, { label: string }>; conditions: Record<string, { label: string }> };
type PlanType = { slug: string; name: string; visits_per_month: number; discount_pct: number; custom: boolean };
type Preview = Record<string, unknown> & { lines?: { label: string; qty: number; amount_kobo: number }[]; deep_lines?: { label: string; qty: number; amount_kobo: number }[] };

export function QuoteBuilder({ requestId, rate, planTypes, initial, isSuperAdmin }: {
  requestId: string; rate: Rate; planTypes: PlanType[]; isSuperAdmin: boolean;
  initial: { service: string; wantsPlan: boolean; bedrooms: number | null; bathrooms: number | null };
}) {
  const { busy, m, run, setM } = useRun();
  const [kind, setKind] = useState(initial.wantsPlan ? "plan" : "one_off");
  const [service, setService] = useState(initial.service);
  const [condition, setCondition] = useState("normal");
  const [spaces, setSpaces] = useState<Record<string, number>>(() => ({ bedroom: initial.bedrooms ?? 0, bathroom: initial.bathrooms ?? 0, living_room: initial.bedrooms ? 1 : 0, kitchen: initial.bedrooms != null ? 1 : 0 }));
  const [addons, setAddons] = useState<Record<string, number>>({});
  const [planType, setPlanType] = useState(planTypes.find((p) => p.slug === "care_4")?.slug ?? planTypes[0]?.slug ?? "");
  const [visits, setVisits] = useState(4);
  const [discount, setDiscount] = useState(0);
  const [bundle, setBundle] = useState(false);
  const [override, setOverride] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewErr, setPreviewErr] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pt = planTypes.find((p) => p.slug === planType);

  const payload = () => ({
    kind, service, condition, spaces, addons,
    plan_type: kind === "plan" ? planType : null,
    visits_per_month: kind === "plan" && pt?.custom ? visits : null,
    discount_pct: kind === "plan" && pt?.custom ? discount : null,
    bundle: kind === "plan" && bundle,
    override_kobo: override.trim() ? Math.round(Number(override) * 100) : null,
    override_reason: overrideReason, exclusions, notes,
  });

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await quotePreview(requestId, payload());
      if (r.ok) { setPreview(r.data as Preview); setPreviewErr(""); } else { setPreview(null); setPreviewErr(r.message); }
    }, 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, service, condition, JSON.stringify(spaces), JSON.stringify(addons), planType, visits, discount, bundle, override]);

  const qty = (obj: Record<string, number>, set: (v: Record<string, number>) => void, k: string) => (
    <input type="number" min={0} max={50} className="w-16 rounded-md border border-line px-2 py-1 text-sm" value={obj[k] ?? 0}
      onChange={(e) => set({ ...obj, [k]: Math.max(0, Math.min(50, Math.round(Number(e.target.value) || 0))) })} />
  );
  const p = preview;
  const n = (k: string) => Number(p?.[k] ?? 0);
  const overrideBad = override.trim() !== "" && (!Number.isFinite(Number(override)) || Number(override) <= 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="radio" checked={kind === "one_off"} onChange={() => setKind("one_off")} /> One-off clean</label>
        <label className="flex items-center gap-2"><input type="radio" checked={kind === "plan"} onChange={() => setKind("plan")} /> Monthly plan</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className={labelCls}>{kind === "plan" ? "Regular visit type" : "Service"}</label>
          <select className={inputCls} value={service} onChange={(e) => setService(e.target.value)}>{Object.keys(rate.services).filter((k) => kind === "one_off" || ["standard", "office", "shortlet"].includes(k)).map((k) => <option key={k} value={k}>{rate.services[k].label ?? SERVICE_LABEL[k]}</option>)}</select></div>
        <div><label className={labelCls}>Condition</label>
          <select className={inputCls} value={condition} onChange={(e) => setCondition(e.target.value)}>{Object.entries(rate.conditions).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        {kind === "plan" && <div><label className={labelCls}>Plan</label>
          <select className={inputCls} value={planType} onChange={(e) => setPlanType(e.target.value)}>{planTypes.map((t) => <option key={t.slug} value={t.slug}>{t.name}{t.custom ? "" : ` (${t.visits_per_month}/month, ${t.discount_pct}% off)`}</option>)}</select></div>}
      </div>
      {kind === "plan" && pt?.custom && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls}>Visits per month</label><input type="number" min={1} max={31} className={inputCls} value={visits} onChange={(e) => setVisits(Math.max(1, Math.min(31, Math.round(Number(e.target.value) || 1))))} /></div>
          <div><label className={labelCls}>Discount %</label><input type="number" min={0} max={60} className={inputCls} value={discount} onChange={(e) => setDiscount(Math.max(0, Math.min(60, Number(e.target.value) || 0)))} /></div>
        </div>
      )}
      {kind === "plan" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bundle} onChange={(e) => setBundle(e.target.checked)} /> Home Complete: add free laundry pickup and delivery (extra discount)</label>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">Rooms and spaces</p>
          {Object.entries(rate.spaces).map(([k, v]) => <div key={k} className="flex items-center justify-between gap-2 text-sm"><span>{v.label} <span className="text-xs text-ink-mute">{nairaK(v.price_kobo)}</span></span>{qty(spaces, setSpaces, k)}</div>)}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Add-ons</p>
          {Object.entries(rate.addons).map(([k, v]) => <div key={k} className="flex items-center justify-between gap-2 text-sm"><span>{v.label} <span className="text-xs text-ink-mute">{nairaK(v.price_kobo)}</span></span>{qty(addons, setAddons, k)}</div>)}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={labelCls}>Agreed price instead (₦, optional)</label><input inputMode="numeric" className={inputCls} value={override} onChange={(e) => setOverride(e.target.value.replace(/[^\d.]/g, ""))} placeholder={kind === "plan" ? "Monthly price" : "Cleaning price, before transport"} /></div>
        {override.trim() && <div><label className={labelCls}>Why change the price?</label><input className={inputCls} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} maxLength={200} /></div>}
      </div>
      {override.trim() && <p className="text-xs text-ink-mute">A changed price goes to admin for approval before the customer sees it (admins can send it straight away).{isSuperAdmin ? "" : " More than 15% below the rate card needs the super admin."}</p>}
      <div><label className={labelCls}>Not included (shown to the customer)</label><input className={inputCls} value={exclusions} onChange={(e) => setExclusions(e.target.value)} maxLength={500} placeholder="For example: no paint removal from ceilings; outside windows above ground floor" /></div>
      <div><label className={labelCls}>Notes (shown to the customer)</label><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></div>

      <div className="rounded-md border border-line bg-canvas p-4 text-sm">
        {previewErr ? <p className="text-red-700">{previewErr}</p> : !p ? <p className="text-ink-soft">Working out the price…</p> : p.kind === "plan" ? (
          <dl className="space-y-1">
            <div className="flex justify-between"><dt>Each regular visit (with transport)</dt><dd>{nairaK(n("visit_price_kobo"))}</dd></div>
            <div className="flex justify-between"><dt>Visits per month</dt><dd>{n("visits_per_month")}</dd></div>
            <div className="flex justify-between"><dt>Discounts</dt><dd>{n("plan_discount_pct")}% plan{n("bundle_discount_pct") ? ` + ${n("bundle_discount_pct")}% Home Complete` : ""}</dd></div>
            <div className="flex justify-between"><dt>Rate card monthly</dt><dd>{nairaK(n("computed_monthly_kobo"))}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Monthly price</dt><dd>{nairaK(n("monthly_kobo"))}</dd></div>
            <div className="flex justify-between"><dt>First deep clean</dt><dd>{nairaK(n("first_deep_kobo"))}</dd></div>
            <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Customer pays to start (1 month)</dt><dd>{nairaK(n("total_kobo"))}</dd></div>
            <p className="text-xs text-ink-mute">Crew {n("crew_size")} · regular visit {minutesLabel(n("duration_min"))} · deep visit {minutesLabel(n("deep_duration_min"))} · transport {nairaK(n("transport_kobo"))}/visit{n("transport_waived_kobo") ? " (waived)" : ""}</p>
          </dl>
        ) : (
          <dl className="space-y-1">
            {(p.lines ?? []).map((l, i) => <div key={i} className="flex justify-between"><dt>{l.label}{l.qty > 1 ? ` × ${l.qty}` : ""}</dt><dd>{nairaK(l.amount_kobo)}</dd></div>)}
            <div className="flex justify-between border-t border-line pt-1"><dt>Cleaning{p.min_applied ? " (minimum job price)" : ""}</dt><dd>{nairaK(n("override_kobo") || n("subtotal_kobo"))}</dd></div>
            <div className="flex justify-between"><dt>Crew transport{n("transport_waived_kobo") ? " (waived)" : ""}</dt><dd>{nairaK(n("transport_kobo"))}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Total</dt><dd>{nairaK(n("total_kobo"))}</dd></div>
            <p className="text-xs text-ink-mute">Crew {n("crew_size")} · about {minutesLabel(n("duration_min"))} on site</p>
          </dl>
        )}
      </div>
      {p && n("crew_size") > 2 && <p className="text-xs text-amber-800">This job needs a crew of {n("crew_size")}. Customers can only book days with at least {n("crew_size")} cleaners on shift (see Cleaning settings).</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" disabled={busy || !!previewErr || overrideBad} onClick={() => run(() => quoteSave(requestId, payload(), false))}>Save draft</button>
        <button type="button" className="btn-primary" disabled={busy || !!previewErr || overrideBad} onClick={() => { setM(null); void run(() => quoteSave(requestId, payload(), true)); }}>{busy ? "Saving…" : "Save and send to customer"}</button>
      </div>
      <Msg m={m} />
    </div>
  );
}

export function QuoteActions({ quoteId, requestId, status, isAdmin }: { quoteId: string; requestId: string; status: string; isAdmin: boolean }) {
  const { busy, m, run } = useRun();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => quoteSend(quoteId, requestId, false))}>Send to customer</button>}
        {status === "awaiting_approval" && isAdmin && <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => quoteSend(quoteId, requestId, true))}>Approve and send</button>}
      </div>
      <Msg m={m} />
    </div>
  );
}

// ---------- Desk payment ----------
export function DeskPay({ invoiceId, amountKobo, points, back }: { invoiceId: string; amountKobo: number; points: { id: string; name: string }[]; back: string }) {
  const { busy, m, run } = useRun();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("transfer");
  const [point, setPoint] = useState(points[0]?.id ?? "");
  const [note, setNote] = useState("");
  if (!open) return <button type="button" className="text-sm font-medium underline" onClick={() => setOpen(true)}>Record desk payment ({nairaK(amountKobo)})</button>;
  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <select className={inputCls + " !mt-0"} value={mode} onChange={(e) => setMode(e.target.value)}><option value="transfer">Bank transfer</option><option value="pos">POS</option><option value="cash">Cash</option></select>
        <select className={inputCls + " !mt-0"} value={point} onChange={(e) => setPoint(e.target.value)}>{points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input className={inputCls + " !mt-0"} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "cash" ? "Note (optional)" : "Sender name or POS reference"} />
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={busy || !point} onClick={() => run(() => deskPay(invoiceId, mode, point, note, back))}>{busy ? "Saving…" : `Confirm ${nairaK(amountKobo)} received`}</button>
        <button type="button" className="text-sm underline" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <Msg m={m} />
    </div>
  );
}
