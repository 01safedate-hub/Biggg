"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { inputCls, labelCls } from "@/components/admin/ui";
import { toKobo } from "@/lib/money";
import { naira } from "@/lib/format";
import { UNITS } from "@/lib/customs";
import {
  addMember, addWatcher, adjustBalance, createCustom, findCustomer, handOver, newBatch, recordDeposit, removeMember, removeWatcher,
  reopenBatch, saveLines, setRates, startPeriod, submitBatch, updateCustom,
} from "@/app/staff/(app)/customs/actions";

type R = { ok: boolean; message: string; id?: string };
type Msg = { ok: boolean; text: string } | null;

function Note({ m }: { m: Msg }) {
  if (!m) return null;
  return <p role={m.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${m.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{m.text}</p>;
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const run = async (fn: () => Promise<R>, after?: (r: R) => void) => {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false); setMsg({ ok: r.ok, text: r.message });
    if (r.ok) { after?.(r); router.refresh(); }
    return r;
  };
  return { busy, msg, setMsg, run, router };
}

function LocateButton({ onFound }: { onFound: (lat: number, lng: number, acc: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button type="button" className="btn-secondary !py-2" disabled={busy} onClick={() => {
        if (!navigator.geolocation) return setErr("This browser cannot detect location.");
        setBusy(true); setErr(null);
        navigator.geolocation.getCurrentPosition((p) => { setBusy(false); onFound(Number(p.coords.latitude.toFixed(6)), Number(p.coords.longitude.toFixed(6)), Math.round(p.coords.accuracy)); },
          (e) => { setBusy(false); setErr(e.code === e.PERMISSION_DENIED ? "Location permission was denied." : "Could not get the location. Turn on GPS and try again."); },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      }}>{busy ? "Finding…" : "Use my current location"}</button>
      {err && <span role="alert" className="ml-2 text-xs text-red-700">{err}</span>}
    </span>
  );
}

export function CreateCustomForm() {
  const { busy, msg, setMsg, run, router } = useAction();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; full_name: string | null; phone: string | null; email: string | null }[]>([]);
  const [mgr, setMgr] = useState<{ id: string; label: string } | null>(null);
  const [mode, setMode] = useState("one_time");
  const [delivery, setDelivery] = useState("collect");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [acc, setAcc] = useState<number | null>(null);
  return (
    <form className="card space-y-4 p-5" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const s = (k: string) => String(f.get(k) ?? "").trim();
      if (!mgr) return setMsg({ ok: false, text: "Search and choose the manager's LaundryPoint account first. Ask them to sign up if they have none." });
      let fee = 0;
      if (mode === "plan") { const k = toKobo(s("fee")); if (!k) return setMsg({ ok: false, text: "Enter the plan fee in naira." }); fee = k; }
      if (delivery === "deliver" && (lat === null || lng === null)) return setMsg({ ok: false, text: "For delivery, stand at the place and press \"Use my current location\"." });
      await run(() => createCustom({ name: s("name"), kind: s("kind"), mode, manager: mgr.id, delivery, address: s("address"), lat, lng, period: mode === "plan" ? s("period") : null, periodFeeKobo: fee, notes: s("notes") }),
        (r) => { if (r.id) router.push(`/staff/customs/${r.id}`); });
    }}>
      <h2 className="text-lg font-semibold">New custom</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="cname" className={labelCls}>Name</label><input id="cname" name="name" required maxLength={80} placeholder="Divine Lodge" className={inputCls} /></div>
        <div><label htmlFor="kind" className={labelCls}>Type</label><select id="kind" name="kind" className={inputCls}><option value="lodge">Student lodge</option><option value="business">Business</option></select></div>
      </div>
      <div>
        <label htmlFor="mq" className={labelCls}>Manager (must have a LaundryPoint account)</label>
        {mgr ? <p className="mt-1 flex items-center gap-3 text-sm"><strong>{mgr.label}</strong><button type="button" className="underline" onClick={() => { setMgr(null); setHits([]); }}>Change</button></p> : (
          <div className="flex gap-2"><input id="mq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or email" className={inputCls} />
            <button type="button" className="btn-secondary mt-1" onClick={async () => setHits(await findCustomer(q))}>Find</button></div>
        )}
        {!mgr && hits.length > 0 && <ul className="mt-2 divide-y divide-line rounded-md border border-line text-sm">{hits.map((h) => (
          <li key={h.id}><button type="button" className="w-full p-2 text-left hover:bg-canvas" onClick={() => setMgr({ id: h.id, label: `${h.full_name ?? "No name"} · ${h.phone ?? h.email ?? ""}` })}>{h.full_name ?? "No name"} <span className="text-ink-soft">· {h.phone ?? ""} {h.email ?? ""}</span></button></li>
        ))}</ul>}
      </div>
      <fieldset className="space-y-2"><legend className={labelCls}>Kind of custom</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === "one_time"} onChange={() => setMode("one_time")} /> One-time: each batch is charged at the agreed rates. Use Repeat for the next batch.</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === "plan"} onChange={() => setMode("plan")} /> Plan: a weekly or monthly fee with an allowance per category. Extra pieces are charged.</label>
      </fieldset>
      {mode === "plan" && <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="period" className={labelCls}>Period</label><select id="period" name="period" className={inputCls}><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></div>
        <div><label htmlFor="fee" className={labelCls}>Plan fee per period, naira</label><input id="fee" name="fee" inputMode="decimal" className={inputCls} /></div>
      </div>}
      <fieldset className="space-y-2"><legend className={labelCls}>Return of clean clothes</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={delivery === "collect"} onChange={() => setDelivery("collect")} /> They collect from the hub</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" checked={delivery === "deliver"} onChange={() => setDelivery("deliver")} /> We deliver (included in their rates)</label>
      </fieldset>
      <div><label htmlFor="address" className={labelCls}>Address</label><input id="address" name="address" maxLength={200} className={inputCls} placeholder="Lodge or business address" /></div>
      {delivery === "deliver" && <div className="flex flex-wrap items-center gap-3 text-sm"><LocateButton onFound={(a, b, c) => { setLat(a); setLng(b); setAcc(c); }} />{lat !== null && <span className={acc && acc > 50 ? "text-amber-700" : "text-emerald-700"}>Location saved{acc ? `, accurate to about ${acc} m` : ""}.</span>}</div>}
      <div><label htmlFor="notes" className={labelCls}>Notes (staff only)</label><textarea id="notes" name="notes" maxLength={500} rows={2} className={inputCls} /></div>
      <Note m={msg} />
      <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create custom"}</button>
    </form>
  );
}

export function SettingsCard({ id, status, delivery, address, notes, mode, feeKobo }: { id: string; status: string; delivery: string; address: string | null; notes: string | null; mode: string; feeKobo: number }) {
  const { busy, msg, setMsg, run } = useAction();
  const [deliv, setDeliv] = useState(delivery);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const s = (k: string) => String(f.get(k) ?? "").trim();
      const patch: Record<string, unknown> = { status: s("status"), delivery: deliv, address: s("address"), notes: s("notes") };
      if (mode === "plan") { const k = toKobo(s("fee")); if (!k) return setMsg({ ok: false, text: "Enter the plan fee in naira." }); patch.period_fee_kobo = k; }
      if (loc) { patch.lat = loc.lat; patch.lng = loc.lng; }
      await run(() => updateCustom(id, patch));
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="st" className={labelCls}>Status</label><select id="st" name="status" defaultValue={status} className={inputCls}><option value="active">Active</option><option value="paused">Paused (no new batches)</option><option value="ended">Ended</option></select></div>
        <div><label htmlFor="dv" className={labelCls}>Return</label><select id="dv" value={deliv} onChange={(e) => setDeliv(e.target.value)} className={inputCls}><option value="collect">They collect</option><option value="deliver">We deliver</option></select></div>
        {mode === "plan" && <div><label htmlFor="pf" className={labelCls}>Plan fee, naira (from the next period)</label><input id="pf" name="fee" inputMode="decimal" defaultValue={String(feeKobo / 100)} className={inputCls} /></div>}
      </div>
      <div><label htmlFor="ad" className={labelCls}>Address</label><input id="ad" name="address" defaultValue={address ?? ""} maxLength={200} className={inputCls} /></div>
      {deliv === "deliver" && <div className="flex flex-wrap items-center gap-2 text-sm"><LocateButton onFound={(lat, lng) => setLoc({ lat, lng })} />{loc && <span className="text-emerald-700">New location ready to save.</span>}</div>}
      <div><label htmlFor="nt" className={labelCls}>Notes (staff only)</label><textarea id="nt" name="notes" defaultValue={notes ?? ""} maxLength={500} rows={2} className={inputCls} /></div>
      <Note m={msg} />
      <button className="btn-secondary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
    </form>
  );
}

type Cat = { id: string; name: string };
type Rate = { category_id: string; unit: string; price: string; allowance: string };

export function RateCardEditor({ id, mode, categories, rates }: { id: string; mode: string; categories: Cat[]; rates: { category_id: string; unit: string; price_kobo: number; allowance: number | null }[] }) {
  const { busy, msg, setMsg, run } = useAction();
  const [rows, setRows] = useState<Rate[]>(rates.map((r) => ({ category_id: r.category_id, unit: r.unit, price: String(r.price_kobo / 100), allowance: r.allowance === null ? "" : String(r.allowance) })));
  const used = new Set(rows.map((r) => r.category_id));
  const set = (i: number, k: keyof Rate, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-sm text-ink-soft">No rates yet. Add each category this custom sends, with its unit and agreed price.</p>}
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
          <div className="col-span-2 sm:col-span-1"><label className={labelCls}>Category</label><select value={r.category_id} onChange={(e) => set(i, "category_id", e.target.value)} className={inputCls}>
            <option value="">Choose…</option>{categories.filter((c) => c.id === r.category_id || !used.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className={labelCls}>Unit</label><select value={r.unit} onChange={(e) => set(i, "unit", e.target.value)} className={inputCls}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
          <div><label className={labelCls}>{mode === "plan" ? "Extra price ₦" : "Price ₦"}</label><input inputMode="decimal" value={r.price} onChange={(e) => set(i, "price", e.target.value)} className={inputCls} /></div>
          {mode === "plan" && <div><label className={labelCls}>Included per period</label><input inputMode="numeric" value={r.allowance} onChange={(e) => set(i, "allowance", e.target.value.replace(/\D/g, ""))} className={inputCls} /></div>}
          <button type="button" className="mb-1 text-sm text-red-700 underline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => setRows([...rows, { category_id: "", unit: "piece", price: "", allowance: mode === "plan" ? "0" : "" }])}>Add a category</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={async () => {
          const out: { category_id: string; unit: string; price_kobo: number; allowance: number | null }[] = [];
          for (const r of rows) {
            if (!r.category_id) return setMsg({ ok: false, text: "Choose a category on every row, or remove the empty row." });
            const k = r.price.trim() === "0" ? 0 : toKobo(r.price);
            if (k === null) return setMsg({ ok: false, text: "Enter a price in naira on every row (0 is allowed)." });
            if (mode === "plan" && r.allowance === "") return setMsg({ ok: false, text: "Enter how many are included per period on every row (0 is allowed)." });
            out.push({ category_id: r.category_id, unit: r.unit, price_kobo: k, allowance: mode === "plan" ? Number(r.allowance) : null });
          }
          if (!out.length) return setMsg({ ok: false, text: "Add at least one category." });
          await run(() => setRates(id, out));
        }}>{busy ? "Saving…" : "Save rate card"}</button>
      </div>
      <Note m={msg} />
    </div>
  );
}

export function MembersEditor({ id, members }: { id: string; members: { id: string; tag: string; name: string; phone: string | null; email: string | null; linked: boolean }[] }) {
  const { busy, msg, setMsg, run } = useAction();
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line text-sm">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span><strong className="mr-2 rounded bg-canvas px-1.5 py-0.5 font-mono text-xs">{m.tag}</strong>{m.name}<span className="text-ink-soft"> · {m.phone ?? m.email ?? "no contact"}{m.linked ? " · has an account" : ""}</span></span>
            <button type="button" className="text-xs text-red-700 underline" disabled={busy} onClick={() => { if (confirm(`Remove ${m.name}? Their past items stay on record.`)) run(() => removeMember(id, m.id)); }}>Remove</button>
          </li>
        ))}
        {members.length === 0 && <li className="py-2 text-ink-soft">No members yet.</li>}
      </ul>
      <form className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end" onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const s = (k: string) => String(f.get(k) ?? "").trim();
        if (s("mname").length < 2) return setMsg({ ok: false, text: "Enter the member's name." });
        const r = await run(() => addMember(id, s("mname"), s("mphone"), s("memail")));
        if (r.ok) form.reset();
      }}>
        <div><label htmlFor="mname" className={labelCls}>Name</label><input id="mname" name="mname" maxLength={80} className={inputCls} /></div>
        <div><label htmlFor="mphone" className={labelCls}>Phone</label><input id="mphone" name="mphone" type="tel" className={inputCls} /></div>
        <div><label htmlFor="memail" className={labelCls}>Email</label><input id="memail" name="memail" type="email" className={inputCls} /></div>
        <button className="btn-secondary mb-0.5" disabled={busy}>Add member</button>
      </form>
      <p className="text-xs text-ink-mute">Each member gets a tag (like {members[0]?.tag ?? "DIV-01"}) to write on their clothes. A member whose phone or email matches a LaundryPoint account can see and confirm their own items.</p>
      <Note m={msg} />
    </div>
  );
}

export function WatchersEditor({ id, watchers, link }: { id: string; watchers: { id: string; email: string }[]; link: string | null }) {
  const { busy, msg, setMsg, run } = useAction();
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line text-sm">
        {watchers.map((w) => <li key={w.id} className="flex items-center justify-between py-2"><span>{w.email}</span><button type="button" className="text-xs text-red-700 underline" disabled={busy} onClick={() => run(() => removeWatcher(id, w.id))}>Remove</button></li>)}
        {watchers.length === 0 && <li className="py-2 text-ink-soft">Nobody else gets the link yet.</li>}
      </ul>
      <form className="flex gap-2" onSubmit={async (e) => {
        e.preventDefault(); const form = e.currentTarget; const email = String(new FormData(form).get("wemail") ?? "").trim();
        if (!email.includes("@")) return setMsg({ ok: false, text: "Enter an email address." });
        const r = await run(() => addWatcher(id, email)); if (r.ok) form.reset();
      }}>
        <input name="wemail" type="email" aria-label="Email to send the link to" placeholder="bursar@example.com" className={inputCls} />
        <button className="btn-secondary mt-1" disabled={busy}>Email link</button>
      </form>
      {link && <p className="text-xs text-ink-mute">Read-only link (no member names): <a className="underline" href={link} target="_blank" rel="noreferrer">open</a>. Anyone with it can view the balance and batches.</p>}
      <Note m={msg} />
    </div>
  );
}

export function DepositForm({ id, points }: { id: string; points: { id: string; name: string; kind: string }[] }) {
  const { busy, msg, setMsg, run } = useAction();
  const [mode, setMode] = useState("cash");
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); const s = (k: string) => String(f.get(k) ?? "").trim();
      const k = toKobo(s("amount")); if (!k) return setMsg({ ok: false, text: "Enter the amount received in naira." });
      if (!s("point")) return setMsg({ ok: false, text: "Choose where the money went." });
      if (mode !== "cash" && s("note").length < 3) return setMsg({ ok: false, text: "For transfer or POS, enter the reference." });
      const r = await run(() => recordDeposit(id, k, mode, s("point"), s("note"))); if (r.ok) form.reset();
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label htmlFor="amt" className={labelCls}>Amount, naira</label><input id="amt" name="amount" inputMode="decimal" className={inputCls} /></div>
        <div><label htmlFor="md" className={labelCls}>Paid by</label><select id="md" value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls}><option value="cash">Cash</option><option value="transfer">Transfer</option><option value="pos">POS</option></select></div>
        <div><label htmlFor="pt" className={labelCls}>Into</label><select id="pt" name="point" className={inputCls}><option value="">Choose…</option>{points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      </div>
      <div><label htmlFor="dn" className={labelCls}>Reference {mode === "cash" ? "(optional)" : "(required)"}</label><input id="dn" name="note" maxLength={120} className={inputCls} /></div>
      <Note m={msg} />
      <button className="btn-primary" disabled={busy}>{busy ? "Recording…" : "Record deposit"}</button>
    </form>
  );
}

export function AdjustForm({ id }: { id: string }) {
  const { busy, msg, setMsg, run } = useAction();
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); const s = (k: string) => String(f.get(k) ?? "").trim();
      const neg = s("amount").startsWith("-"); const k = toKobo(s("amount").replace(/^-/, ""));
      if (!k) return setMsg({ ok: false, text: "Enter an amount, with a minus sign to take money off." });
      if (s("why").length < 5) return setMsg({ ok: false, text: "Say why." });
      const r = await run(() => adjustBalance(id, neg ? -k : k, s("why"))); if (r.ok) form.reset();
    }}>
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr]"><input name="amount" aria-label="Adjustment in naira" placeholder="-5000" className={inputCls} /><input name="why" aria-label="Reason" placeholder="Money returned to the lodge" className={inputCls} /></div>
      <Note m={msg} />
      <button className="btn-secondary" disabled={busy}>Adjust balance</button>
    </form>
  );
}

export function PeriodButton({ id, feeKobo, balanceKobo }: { id: string; feeKobo: number; balanceKobo: number }) {
  const { busy, msg, run } = useAction();
  return (
    <div className="space-y-2">
      <button className="btn-primary" disabled={busy || balanceKobo < feeKobo} onClick={() => run(() => startPeriod(id))}>{busy ? "Starting…" : `Start the next period (${naira(feeKobo)})`}</button>
      {balanceKobo < feeKobo && <p className="text-xs text-red-700">The balance must cover the plan fee first. Record a deposit.</p>}
      <Note m={msg} />
    </div>
  );
}

export function NewBatchButton({ id, label = "New batch" }: { id: string; label?: string }) {
  const { busy, msg, run, router } = useAction();
  return (
    <div className="space-y-2">
      <button className="btn-primary" disabled={busy} onClick={() => run(() => newBatch(id, ""), (r) => { if (r.id) router.push(`/staff/customs/batch/${r.id}`); })}>{busy ? "Starting…" : label}</button>
      <Note m={msg} />
    </div>
  );
}

type Member = { id: string; tag: string; name: string };
type BatchLine = { member_id: string; category_id: string; qty: number };

/** Count grid: one row per member, one box per rated category. */
export function BatchEntry({ order, members, categories, lines, editable }: { order: string; members: Member[]; categories: { id: string; name: string; unit: string }[]; lines: BatchLine[]; editable: boolean }) {
  const { busy, msg, setMsg, run } = useAction();
  const key = (m: string, c: string) => `${m}|${c}`;
  const start = Object.fromEntries(lines.map((l) => [key(l.member_id, l.category_id), String(l.qty)]));
  const [vals, setVals] = useState<Record<string, string>>(start);
  const [filter, setFilter] = useState("");
  const total = Object.values(vals).reduce((a, v) => a + (Number(v) || 0), 0);
  const changed = () => Object.entries(vals).filter(([k, v]) => (Number(v) || 0) !== (Number(start[k]) || 0)).concat(Object.keys(start).filter((k) => !(k in vals)).map((k) => [k, "0"] as [string, string]));
  const save = async () => {
    const ch = changed();
    if (ch.some(([, v]) => v !== "" && (!/^\d+$/.test(v) || Number(v) > 500))) { setMsg({ ok: false, text: "Quantities must be whole numbers up to 500." }); return false; }
    if (!ch.length) return true;
    const r = await run(() => saveLines(order, ch.map(([k, v]) => { const [member, category] = k.split("|"); return { member, category, qty: Number(v) || 0 }; })));
    return r.ok;
  };
  const shown = members.filter((m) => !filter || `${m.tag} ${m.name}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="space-y-3">
      {members.length > 8 && <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a member by name or tag" aria-label="Find a member" className={inputCls} />}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-mute"><th className="py-1 pr-2">Member</th>{categories.map((c) => <th key={c.id} className="px-1 py-1 text-center">{c.name}{c.unit !== "piece" ? ` (${c.unit})` : ""}</th>)}</tr></thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <td className="py-1.5 pr-2"><span className="font-mono text-xs">{m.tag}</span> {m.name}</td>
                {categories.map((c) => {
                  const k = key(m.id, c.id);
                  return <td key={c.id} className="px-1 py-1.5 text-center">{editable
                    ? <input aria-label={`${m.name}, ${c.name}`} inputMode="numeric" value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value.replace(/\D/g, "") })} className="w-14 rounded-md border border-line px-1 py-1 text-center" />
                    : <span className="tabular-nums">{vals[k] ?? ""}</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-soft">{total} piece{total === 1 ? "" : "s"} in this batch.</p>
      {editable && <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save count"}</button>
        <button className="btn-primary" disabled={busy || total === 0} onClick={async () => { if (await save()) await run(() => submitBatch(order)); }}>Send for confirmation</button>
      </div>}
      <Note m={msg} />
    </div>
  );
}

export function BatchActions({ order, status, charged }: { order: string; status: string; charged: boolean }) {
  const { busy, msg, run } = useAction();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "counted" && !charged && <button className="btn-secondary" disabled={busy} onClick={() => run(() => reopenBatch(order))}>Reopen the count</button>}
        {status === "ready" && <button className="btn-primary" disabled={busy} onClick={() => { if (confirm("Hand this batch over to the custom now?")) run(() => handOver(order)); }}>Handed over to the custom</button>}
      </div>
      <Note m={msg} />
    </div>
  );
}
