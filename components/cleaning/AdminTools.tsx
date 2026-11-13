"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, labelCls } from "@/components/admin/ui";
import { WEEKDAY_LABEL, WINDOW_LABEL, lagosDate, nairaK } from "@/lib/cleaning";
import { managePlan, resolveIssue, saveCleaningSettings, savePlanType, saveRateCard, saveZoneDays } from "@/app/staff/(app)/cleaning/actions";
import { Msg, type R } from "./shared";

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);
  async function run(fn: () => Promise<R>) { setBusy(true); setM(null); const r = await fn(); setBusy(false); setM(r); if (r.ok) router.refresh(); return r; }
  return { busy, m, run };
}

export function PlanAdmin({ subId, status, cancelAtEnd }: { subId: string; status: string; cancelAtEnd: boolean }) {
  const { busy, m, run } = useRun();
  const [pause, setPause] = useState(false);
  const [from, setFrom] = useState(lagosDate(1));
  const [until, setUntil] = useState(lagosDate(8));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-sm">
        {status === "active" && <button type="button" className="underline" onClick={() => setPause(!pause)}>Pause</button>}
        {cancelAtEnd ? <button type="button" className="underline" disabled={busy} onClick={() => run(() => managePlan(subId, "undo"))}>Undo cancellation</button>
          : <button type="button" className="text-red-700 underline" disabled={busy} onClick={() => { if (confirm("End this plan at the close of its paid period?")) void run(() => managePlan(subId, "cancel")); }}>End at period end</button>}
      </div>
      {pause && (
        <div className="flex flex-wrap items-end gap-2">
          <div><label className={labelCls}>From</label><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className={labelCls}>Until</label><input type="date" className={inputCls} value={until} onChange={(e) => setUntil(e.target.value)} /></div>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => managePlan(subId, "pause", from, until))}>Pause plan</button>
        </div>
      )}
      <Msg m={m} />
    </div>
  );
}

export function IssueResolve({ issueId, capKobo, superAdmin }: { issueId: string; capKobo: number; superAdmin: boolean }) {
  const { busy, m, run } = useRun();
  const [action, setAction] = useState("reclean");
  const [outcome, setOutcome] = useState("");
  const [date, setDate] = useState(lagosDate(1));
  const [win, setWin] = useState("morning");
  const [payout, setPayout] = useState("");
  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <select className={inputCls + " !mt-0"} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="reclean">Book a free re-clean</option>
          <option value="payout">Pay compensation</option>
          <option value="resolve">Resolved another way</option>
          <option value="reject">Not our fault (close)</option>
        </select>
        <input className={inputCls + " !mt-0"} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What was agreed with the customer" maxLength={1000} />
      </div>
      {action === "reclean" && (
        <div className="flex flex-wrap gap-2">
          <input type="date" className={inputCls + " !mt-0 w-auto"} min={lagosDate(1)} value={date} onChange={(e) => setDate(e.target.value)} />
          <select className={inputCls + " !mt-0 w-auto"} value={win} onChange={(e) => setWin(e.target.value)}>{Object.entries(WINDOW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      )}
      {action === "payout" && (
        <div>
          <input className={inputCls + " !mt-0"} inputMode="numeric" value={payout} onChange={(e) => setPayout(e.target.value.replace(/\D/g, ""))} placeholder="Amount ₦" />
          <p className="mt-1 text-xs text-ink-mute">{superAdmin ? "" : `Above ${nairaK(capKobo)} needs the super admin. `}Record the actual transfer in Spending.</p>
        </div>
      )}
      <button type="button" className="btn-secondary" disabled={busy || outcome.trim().length < 3} onClick={() => run(() => resolveIssue(issueId, action, outcome, action === "reclean" ? date : null, action === "reclean" ? win : null, action === "payout" ? Number(payout || 0) * 100 : null))}>Save</button>
      <Msg m={m} />
    </div>
  );
}

// ---------- Settings ----------
type Field = { key: string; label: string; unit: "naira" | "number" | "percent" | "text"; help?: string };
const FIELDS: Field[] = [
  { key: "hotline", label: "Hotline (shown on the site)", unit: "text" },
  { key: "whatsapp", label: "WhatsApp number (international, digits only)", unit: "text" },
  { key: "admin_email", label: "Email for new requests and alerts", unit: "text" },
  { key: "min_job_kobo", label: "Minimum job price", unit: "naira" },
  { key: "quote_valid_days", label: "Quote valid for (days)", unit: "number" },
  { key: "inspector_limit_kobo", label: "Quotes above this need admin approval", unit: "naira" },
  { key: "override_floor_pct", label: "Price cut beyond this % needs super admin", unit: "percent" },
  { key: "deposit_threshold_kobo", label: "Deposit allowed for jobs from", unit: "naira" },
  { key: "deposit_pct", label: "Deposit %", unit: "percent" },
  { key: "bundle_discount_pct", label: "Home Complete extra discount %", unit: "percent" },
  { key: "hold_minutes", label: "Hold a chosen day while paying (minutes)", unit: "number" },
  { key: "reschedule_cutoff_hours", label: "Customers can move visits up to (hours before)", unit: "number" },
  { key: "complaint_window_hours", label: "Complaint window after a visit (hours)", unit: "number" },
  { key: "credit_valid_days", label: "Credit visits expire after (days)", unit: "number" },
  { key: "renewal_grace_days", label: "Plan pauses this many days after an unpaid renewal", unit: "number" },
  { key: "damage_cap_kobo", label: "Compensation above this needs super admin", unit: "naira" },
  { key: "travel_buffer_min", label: "Travel time per visit (minutes)", unit: "number" },
  { key: "max_minutes_per_cleaner", label: "Max minutes per cleaner per visit", unit: "number" },
  { key: "daily_cap_min", label: "Max working minutes per cleaner per day", unit: "number" },
  { key: "fallback_cleaners", label: "Cleaners per day (used until working days are set)", unit: "number" },
  { key: "fallback_daily_crew_minutes", label: "Crew minutes per day (used until working days are set)", unit: "number" },
  { key: "plan_horizon_days", label: "Plan visits are booked this many days ahead", unit: "number" },
  { key: "crew_hour_rate_kobo", label: "Crew pay per hour (report)", unit: "naira" },
  { key: "crew_min_visit_kobo", label: "Crew minimum pay per visit (report)", unit: "naira" },
  { key: "five_star_bonus_kobo", label: "Five-star bonus per person (report)", unit: "naira" },
  { key: "inspection_pay_kobo", label: "Inspector pay per inspection (report)", unit: "naira" },
  { key: "inspection_accept_bonus_kobo", label: "Inspector bonus when the quote is accepted (report)", unit: "naira" },
];

export function SettingsEditor({ settings }: { settings: Record<string, unknown> }) {
  const { busy, m, run } = useRun();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, f.unit === "naira" ? String(Number(settings[f.key] ?? 0) / 100) : String(settings[f.key] ?? "")])));
  const bandsInit = (settings.inspection_fee_bands as { max_km: number; fee_kobo: number }[] | undefined) ?? [];
  const [bands, setBands] = useState(bandsInit.map((b) => ({ max_km: String(b.max_km), fee: String(b.fee_kobo / 100) })));
  const terms = (settings.term_discounts as Record<string, number> | undefined) ?? {};
  const [termV, setTermV] = useState<Record<string, string>>({ monthly: String(terms.monthly ?? 0), three_month: String(terms.three_month ?? 0), six_month: String(terms.six_month ?? 0), yearly: String(terms.yearly ?? 0) });
  function save() {
    const patch: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const raw = (v[f.key] ?? "").trim();
      if (f.unit === "text") patch[f.key] = raw;
      else if (raw !== "" && Number.isFinite(Number(raw))) patch[f.key] = f.unit === "naira" ? Math.round(Number(raw) * 100) : Number(raw);
    }
    patch.inspection_fee_bands = bands.filter((b) => Number(b.max_km) > 0 && Number(b.fee) >= 0).map((b) => ({ max_km: Number(b.max_km), fee_kobo: Math.round(Number(b.fee) * 100) })).sort((a, b) => a.max_km - b.max_km);
    patch.term_discounts = Object.fromEntries(Object.entries(termV).map(([k, x]) => [k, Math.max(0, Math.min(50, Number(x) || 0))]));
    return run(() => saveCleaningSettings(patch));
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key}><label className={labelCls}>{f.label}{f.unit === "naira" ? " (₦)" : f.unit === "percent" ? " (%)" : ""}</label>
            <input className={inputCls} value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} inputMode={f.unit === "text" ? "text" : "decimal"} /></div>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Inspection fee by distance from the hub</p>
        {bands.map((b, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <span>Up to</span><input className="w-20 rounded-md border border-line px-2 py-1" value={b.max_km} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, max_km: e.target.value } : x)))} /><span>km: ₦</span>
            <input className="w-28 rounded-md border border-line px-2 py-1" value={b.fee} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, fee: e.target.value } : x)))} />
            <button type="button" className="text-xs underline" onClick={() => setBands(bands.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="text-sm underline" onClick={() => setBands([...bands, { max_km: "999", fee: "7000" }])}>Add a band</button>
        <p className="text-xs text-ink-mute">The last band should cover the furthest address (for example 999 km).</p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Discount for paying a plan ahead (%)</p>
        <div className="flex flex-wrap gap-3 text-sm">{Object.keys(termV).map((k) => <label key={k} className="flex items-center gap-2">{k.replace("_", " ")} <input className="w-16 rounded-md border border-line px-2 py-1" value={termV[k]} onChange={(e) => setTermV({ ...termV, [k]: e.target.value })} /></label>)}</div>
      </div>
      <button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save settings"}</button>
      <Msg m={m} />
    </div>
  );
}

// Used for the example prices on the website, so they cannot be removed.
const CORE_SPACES = ["bedroom", "living_room", "kitchen", "bathroom"];

type Entry = { label: string; price_kobo?: number; minutes?: number; multiplier?: number };
type RateData = { spaces: Record<string, Entry>; addons: Record<string, Entry>; services: Record<string, Entry>; conditions: Record<string, Entry>; round_to_kobo?: number };

export function RateCardEditor({ data }: { data: RateData }) {
  const { busy, m, run } = useRun();
  const [d, setD] = useState<RateData>(() => JSON.parse(JSON.stringify(data)));
  const [note, setNote] = useState("");
  const [newKey, setNewKey] = useState({ group: "spaces" as "spaces" | "addons", code: "", label: "" });
  const set = (group: keyof RateData, k: string, field: keyof Entry, val: string) => {
    const g = { ...(d[group] as Record<string, Entry>) };
    g[k] = { ...g[k], [field]: field === "label" ? val : field === "price_kobo" ? Math.round(Number(val || 0) * 100) : Number(val || 0) };
    setD({ ...d, [group]: g });
  };
  const priced = (group: "spaces" | "addons") => (
    <div className="space-y-1">
      {Object.entries(d[group]).map(([k, e]) => (
        <div key={k} className="grid grid-cols-[1fr_6rem_5rem_auto] items-center gap-2 text-sm">
          <input className="rounded-md border border-line px-2 py-1" value={e.label} onChange={(x) => set(group, k, "label", x.target.value)} />
          <input className="rounded-md border border-line px-2 py-1" aria-label="Price in naira" value={String((e.price_kobo ?? 0) / 100)} onChange={(x) => set(group, k, "price_kobo", x.target.value)} />
          <input className="rounded-md border border-line px-2 py-1" aria-label="Minutes" value={String(e.minutes ?? 0)} onChange={(x) => set(group, k, "minutes", x.target.value)} />
          {group === "spaces" && CORE_SPACES.includes(k) ? <span className="text-xs text-ink-mute">Needed</span> : <button type="button" className="text-xs underline" onClick={() => { const g = { ...d[group] }; delete g[k]; setD({ ...d, [group]: g }); }}>Remove</button>}
        </div>
      ))}
    </div>
  );
  const multi = (group: "services" | "conditions") => (
    <div className="space-y-1">
      {Object.entries(d[group]).map(([k, e]) => (
        <div key={k} className="grid grid-cols-[1fr_5rem] items-center gap-2 text-sm">
          <input className="rounded-md border border-line px-2 py-1" value={e.label} onChange={(x) => set(group, k, "label", x.target.value)} />
          <input className="rounded-md border border-line px-2 py-1" aria-label="Multiplier" value={String(e.multiplier ?? 1)} onChange={(x) => set(group, k, "multiplier", x.target.value)} />
        </div>
      ))}
    </div>
  );
  function addRow() {
    const code = newKey.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!code || !newKey.label.trim() || d[newKey.group][code]) return;
    setD({ ...d, [newKey.group]: { ...d[newKey.group], [code]: { label: newKey.label.trim(), price_kobo: 0, minutes: 0 } } });
    setNewKey({ ...newKey, code: "", label: "" });
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-mute">Prices are for a standard clean in light condition. Service and condition multiply them. Columns: name, price (₦), minutes for one cleaner.</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div><p className="mb-1 text-sm font-medium">Rooms and spaces</p>{priced("spaces")}</div>
        <div><p className="mb-1 text-sm font-medium">Add-ons</p>{priced("addons")}</div>
        <div><p className="mb-1 text-sm font-medium">Services (price multiplier)</p>{multi("services")}</div>
        <div><p className="mb-1 text-sm font-medium">Condition (price multiplier)</p>{multi("conditions")}</div>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <select className="rounded-md border border-line px-2 py-1" value={newKey.group} onChange={(e) => setNewKey({ ...newKey, group: e.target.value as "spaces" | "addons" })}><option value="spaces">New room or space</option><option value="addons">New add-on</option></select>
        <input className="rounded-md border border-line px-2 py-1" placeholder="Short code, e.g. garage" value={newKey.code} onChange={(e) => setNewKey({ ...newKey, code: e.target.value })} />
        <input className="rounded-md border border-line px-2 py-1" placeholder="Name shown" value={newKey.label} onChange={(e) => setNewKey({ ...newKey, label: e.target.value })} />
        <button type="button" className="btn-secondary" onClick={addRow}>Add</button>
      </div>
      <div><label className={labelCls}>What changed? (kept in the history)</label><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></div>
      <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => saveRateCard(d as unknown as Record<string, unknown>, note))}>{busy ? "Saving…" : "Publish new rate card"}</button>
      <Msg m={m} />
    </div>
  );
}

type PlanT = { slug: string; name: string; blurb: string | null; visits_per_month: number; deep_every_months: number | null; discount_pct: number; custom: boolean; active: boolean };
export function PlanTypeEditor({ plan }: { plan: PlanT }) {
  const { busy, m, run } = useRun();
  const [p, setP] = useState({ name: plan.name, blurb: plan.blurb ?? "", visits: String(plan.visits_per_month), deep: plan.deep_every_months ? String(plan.deep_every_months) : "", discount: String(plan.discount_pct), active: plan.active });
  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem_6rem_6rem]">
        <input className={inputCls + " !mt-0"} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} aria-label="Name" />
        <input className={inputCls + " !mt-0"} value={p.visits} onChange={(e) => setP({ ...p, visits: e.target.value })} aria-label="Visits per month" title="Visits per month" />
        <input className={inputCls + " !mt-0"} value={p.deep} onChange={(e) => setP({ ...p, deep: e.target.value })} aria-label="Deep clean every N months" placeholder="Deep every" title="Deep clean every N months (blank for none)" />
        <input className={inputCls + " !mt-0"} value={p.discount} onChange={(e) => setP({ ...p, discount: e.target.value })} aria-label="Discount %" title="Discount %" />
      </div>
      <input className={inputCls + " !mt-0"} value={p.blurb} onChange={(e) => setP({ ...p, blurb: e.target.value })} aria-label="Description" maxLength={200} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} /> Offered</label>
        <span className="text-xs text-ink-mute">{plan.custom ? "Custom: visits and discount are set on each quote." : "Columns: name, visits a month, deep clean every N months, discount %."}</span>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => savePlanType({ slug: plan.slug, name: p.name, blurb: p.blurb, visits_per_month: p.visits, deep_every_months: p.deep, discount_pct: p.discount, active: p.active }))}>Save</button>
      </div>
      <Msg m={m} />
    </div>
  );
}

export function ZoneDays({ zoneId, name, days }: { zoneId: string; name: string; days: number[] }) {
  const { busy, m, run } = useRun();
  const [sel, setSel] = useState<number[]>(days);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="w-32 font-medium">{name}</span>
      {[1, 2, 3, 4, 5, 6].map((d) => <label key={d} className="flex items-center gap-1"><input type="checkbox" checked={sel.includes(d)} onChange={(e) => setSel(e.target.checked ? [...sel, d] : sel.filter((x) => x !== d))} />{WEEKDAY_LABEL[d].slice(0, 3)}</label>)}
      <button type="button" className="text-xs underline" disabled={busy} onClick={() => run(() => saveZoneDays(zoneId, sel))}>Save</button>
      <Msg m={m} />
    </div>
  );
}
