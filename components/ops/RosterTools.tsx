"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addOneShift, cancelShift, makeShifts, saveShiftTemplate } from "@/app/staff/(app)/ops-actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
type Tpl = { weekday: number; starts_at: string; ends_at: string; active: boolean };

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(f: () => Promise<{ ok: boolean; message: string }>) { setBusy(true); const r = await f(); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh(); }
  return { busy, msg, run };
}
const Note = ({ m }: { m: { ok: boolean; text: string } | null }) => (m ? <p role={m.ok ? "status" : "alert"} className={`text-xs ${m.ok ? "text-emerald-700" : "text-red-700"}`}>{m.text}</p> : null);

export function TemplateEditor({ staffId, name, templates }: { staffId: string; name: string; templates: Tpl[] }) {
  const { busy, msg, run } = useAct();
  const by = new Map(templates.map((t) => [t.weekday, t]));
  const [rows, setRows] = useState(() => Object.fromEntries(ORDER.map((d) => { const t = by.get(d); return [d, { on: !!t?.active, s: t?.starts_at?.slice(0, 5) ?? "08:00", e: t?.ends_at?.slice(0, 5) ?? "14:00" }]; })));
  return (
    <details className="card p-4">
      <summary className="cursor-pointer font-medium">{name} <span className="text-xs font-normal text-ink-soft">· {templates.filter((t) => t.active).length} days a week</span></summary>
      <div className="mt-3 space-y-2">
        {ORDER.map((d) => (
          <div key={d} className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex w-32 items-center gap-2"><input type="checkbox" checked={rows[d].on} onChange={(e) => setRows({ ...rows, [d]: { ...rows[d], on: e.target.checked } })} />{DAYS[d]}</label>
            <input type="time" aria-label={`${DAYS[d]} start`} disabled={!rows[d].on} value={rows[d].s} onChange={(e) => setRows({ ...rows, [d]: { ...rows[d], s: e.target.value } })} className="rounded-md border border-line px-2 py-1" />
            <span>to</span>
            <input type="time" aria-label={`${DAYS[d]} end`} disabled={!rows[d].on} value={rows[d].e} onChange={(e) => setRows({ ...rows, [d]: { ...rows[d], e: e.target.value } })} className="rounded-md border border-line px-2 py-1" />
          </div>
        ))}
        <button className="btn-primary !px-4 !py-2" disabled={busy} onClick={() => run(async () => {
          for (const d of ORDER) { const r = rows[d]; const res = await saveShiftTemplate(staffId, d, r.on ? r.s : null, r.on ? r.e : null, r.on); if (!res.ok) return res; }
          return { ok: true, message: "Weekly pattern saved. Use “Create shifts” to apply it to the calendar." };
        })}>Save weekly pattern</button>
        <Note m={msg} />
      </div>
    </details>
  );
}

export function GenerateShifts() {
  const { busy, msg, run } = useAct();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {[7, 14, 28].map((d) => <button key={d} className="btn-secondary" disabled={busy} onClick={() => run(() => makeShifts(d))}>Create shifts for the next {d} days</button>)}
      </div>
      <Note m={msg} />
    </div>
  );
}

export function AddShiftForm({ agents }: { agents: { id: string; name: string }[] }) {
  const { busy, msg, run } = useAct();
  const [who, setWho] = useState("");
  const [date, setDate] = useState("");
  const [s, setS] = useState("08:00");
  const [e, setE] = useState("14:00");
  return (
    <form className="card space-y-3 p-4" onSubmit={(ev) => { ev.preventDefault(); run(() => addOneShift(who, date, s, e)); }}>
      <h3 className="font-semibold">Add a one-off shift</h3>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>Agent<select required value={who} onChange={(x) => setWho(x.target.value)} className="mt-1 block rounded-md border border-line px-2 py-2"><option value="">Choose</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>Date<input required type="date" value={date} onChange={(x) => setDate(x.target.value)} className="mt-1 block rounded-md border border-line px-2 py-2" /></label>
        <label>From<input type="time" required value={s} onChange={(x) => setS(x.target.value)} className="mt-1 block rounded-md border border-line px-2 py-2" /></label>
        <label>To<input type="time" required value={e} onChange={(x) => setE(x.target.value)} className="mt-1 block rounded-md border border-line px-2 py-2" /></label>
        <button className="btn-primary" disabled={busy}>Add</button>
      </div>
      <Note m={msg} />
    </form>
  );
}

export function RemoveShift({ id }: { id: string }) {
  const { busy, msg, run } = useAct();
  return <span><button className="text-xs font-medium text-red-700 hover:underline" disabled={busy} onClick={() => { if (window.confirm("Remove this shift?")) run(() => cancelShift(id)); }}>Remove</button>{msg && !msg.ok && <span role="alert" className="ml-2 text-xs text-red-700">{msg.text}</span>}</span>;
}
