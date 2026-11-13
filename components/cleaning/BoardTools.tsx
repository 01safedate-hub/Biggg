"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, labelCls } from "@/components/admin/ui";
import { WINDOW_LABEL, lagosDate } from "@/lib/cleaning";
import { assignCrew, cancelVisit, moveVisit, setStartTime } from "@/app/staff/(app)/cleaning/actions";
import { Msg, type R } from "./shared";

type Staff = { id: string; name: string; roles: string[] };

export function VisitControls({ visitId, crewSize, crew, staff, startTime, status }: { visitId: string; crewSize: number; crew: { id: string; role: string }[]; staff: Staff[]; startTime: string | null; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);
  const [open, setOpen] = useState<"" | "crew" | "time" | "move" | "cancel">("");
  const [lead, setLead] = useState(crew.find((c) => c.role === "lead")?.id ?? "");
  const [members, setMembers] = useState<string[]>(crew.filter((c) => c.role !== "lead").map((c) => c.id));
  const [time, setTime] = useState(startTime?.slice(0, 5) ?? "");
  const [date, setDate] = useState(lagosDate(1));
  const [win, setWin] = useState("morning");
  const [reason, setReason] = useState("");
  const [byUs, setByUs] = useState(true);
  const leads = staff.filter((s) => s.roles.some((r) => ["cleaning_lead", "scheduler", "admin", "super_admin"].includes(r)));
  const cleaners = staff.filter((s) => s.roles.some((r) => ["cleaner", "cleaning_lead"].includes(r)) && s.id !== lead);
  async function go(fn: () => Promise<R>) { setBusy(true); setM(null); const r = await fn(); setBusy(false); setM(r); if (r.ok) { setOpen(""); router.refresh(); } }
  const tab = (k: typeof open, label: string) => <button type="button" className={`text-xs font-medium underline ${open === k ? "text-brand-dark" : ""}`} onClick={() => setOpen(open === k ? "" : k)}>{label}</button>;
  const live = ["scheduled", "on_the_way", "in_progress", "held"].includes(status);
  if (!live) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">{tab("crew", crew.length ? "Change crew" : "Assign crew")}{tab("time", "Set start time")}{status === "scheduled" && tab("move", "Move")}{["scheduled", "on_the_way", "held"].includes(status) && tab("cancel", "Cancel")}</div>
      {open === "crew" && (
        <div className="space-y-2 rounded-md border border-line p-3">
          <div><label className={labelCls}>Crew lead (holds the codes)</label><select className={inputCls} value={lead} onChange={(e) => setLead(e.target.value)}><option value="">Choose</option>{leads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <p className={labelCls}>Cleaners (this job needs {crewSize} in total)</p>
          <div className="grid gap-1 sm:grid-cols-2">{cleaners.map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={members.includes(s.id)} onChange={(e) => setMembers(e.target.checked ? [...members, s.id] : members.filter((x) => x !== s.id))} />{s.name}</label>)}</div>
          {cleaners.length === 0 && <p className="text-xs text-ink-mute">No cleaners yet. Invite staff with the Cleaner or Crew lead role.</p>}
          {lead && 1 + members.length < crewSize && <p className="text-xs text-amber-800">Only {1 + members.length} of {crewSize} people chosen. The job will run longer.</p>}
          <button type="button" className="btn-primary" disabled={busy || !lead} onClick={() => go(() => assignCrew(visitId, lead, members))}>Save crew</button>
        </div>
      )}
      {open === "time" && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-line p-3">
          <div><label className={labelCls}>Arrive at</label><input type="time" min="08:00" max="17:00" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} /></div>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => go(() => setStartTime(visitId, time || null))}>Save and tell customer</button>
        </div>
      )}
      {open === "move" && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-line p-3">
          <div><label className={labelCls}>New day</label><input type="date" className={inputCls} min={lagosDate(1)} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className={labelCls}>Time</label><select className={inputCls} value={win} onChange={(e) => setWin(e.target.value)}>{Object.entries(WINDOW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => go(() => moveVisit(visitId, date, win))}>Move visit</button>
          <p className="w-full text-xs text-ink-mute">Agree the new day with the customer first.</p>
        </div>
      )}
      {open === "cancel" && (
        <div className="space-y-2 rounded-md border border-red-200 p-3">
          <input className={inputCls} placeholder="Reason (the customer sees it)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={byUs} onChange={(e) => setByUs(e.target.checked)} /> We are cancelling (plan customers get a free credit visit)</label>
          {!byUs && <p className="text-xs text-ink-mute">Customer cancelled late: the visit counts as used.</p>}
          <button type="button" className="btn-secondary" disabled={busy || reason.trim().length < 3} onClick={() => go(() => cancelVisit(visitId, reason, byUs))}>Cancel visit</button>
        </div>
      )}
      <Msg m={m} />
    </div>
  );
}
