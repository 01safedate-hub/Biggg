"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls, labelCls } from "@/components/admin/ui";
import { SERVICE_LABEL, VISIT_STATUS_LABEL, minutesLabel, nairaK } from "@/lib/cleaning";
import { crewArrive, crewChecklist, crewExtra, crewFinish, crewIssue, crewNoShow, crewOnWay, crewPhotos } from "@/app/staff/(app)/cleaning/actions";
import { Msg, PhotoUpload, type R } from "./shared";

type Item = { item: string; done: boolean; note: string | null };
export type Job = {
  id: string; visit_no: number; window: string; start_time: string | null; status: string; kind: string; customer_id: string; balance_due_kobo: number;
  service: string; duration_min: number; crew_size: number; my_role: string; customer: string; phone: string | null; address: string; lat: number; lng: number;
  property: { kind: string; water: string | null; power: string | null; access: string | null; keys_allowed: boolean; key_holder: string | null; pets: string | null; estate: string | null; gate: string | null; people: string | null };
  bundle_laundry: boolean; checklist: Item[]; before: number; after: number;
  lines: { label: string; qty: number }[]; crew: { name: string; role: string }[] | null;
  extras: { id: string; amount_kobo: number; status: string; lines: { label: string; qty: number; amount_kobo: number }[] }[] | null;
};

export function CrewJob({ job, addons }: { job: Job; addons: { code: string; label: string; price_kobo: number }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);
  const [code, setCode] = useState("");
  const [doneCode, setDoneCode] = useState("");
  const [list, setList] = useState<Item[]>(job.checklist ?? []);
  const [before, setBefore] = useState<string[]>([]);
  const [after, setAfter] = useState<string[]>([]);
  const [panel, setPanel] = useState<"" | "extra" | "issue" | "noshow">("");
  const [extraQty, setExtraQty] = useState<Record<string, number>>({});
  const [customLabel, setCustomLabel] = useState("");
  const [customNaira, setCustomNaira] = useState("");
  const [customMin, setCustomMin] = useState("");
  const [issueKind, setIssueKind] = useState("damage");
  const [issueText, setIssueText] = useState("");
  const [issuePhotos, setIssuePhotos] = useState<string[]>([]);
  const [noShowNote, setNoShowNote] = useState("");
  const lead = job.my_role === "lead";
  const folder = `visits/${job.customer_id}/${job.id}`;
  const pendingExtra = (job.extras ?? []).some((e) => e.status === "pending");

  async function go(fn: () => Promise<R>, refresh = true) {
    setBusy(true); setM(null);
    const r = await fn();
    setBusy(false); setM(r);
    if (r.ok && refresh) router.refresh();
    return r;
  }
  async function savePhotos(phase: "before" | "after", paths: string[]) {
    if (!paths.length) return;
    const r = await go(() => crewPhotos(job.id, phase, paths));
    if (r.ok) (phase === "before" ? setBefore : setAfter)([]);
  }
  function toggle(i: number) {
    const next = list.map((x, j) => (j === i ? { ...x, done: !x.done } : x));
    setList(next);
    void crewChecklist(job.id, next);
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="font-semibold">#{job.visit_no} · {job.start_time ? job.start_time.slice(0, 5) : job.window} · {SERVICE_LABEL[job.service] ?? job.service}</p>
          <p className="text-sm">{job.customer} {job.phone ? <a className="underline" href={`tel:${job.phone}`}>{job.phone}</a> : null}</p>
          <p className="text-sm text-ink-soft">{job.address} · <a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`}>Directions</a></p>
          <p className="text-xs text-ink-mute">Crew {job.crew_size} · about {minutesLabel(job.duration_min)} · {job.crew?.map((c) => `${c.name}${c.role === "lead" ? " (lead)" : ""}`).join(", ")}</p>
        </div>
        <span className="h-fit rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-dark">{VISIT_STATUS_LABEL[job.status] ?? job.status}</span>
      </div>
      <div className="rounded-md bg-canvas p-3 text-xs text-ink-soft">
        Water: {job.property.water ?? "?"} · Power: {job.property.power ?? "?"} · Access: {job.property.access ?? "?"}{job.property.gate ? ` · Gate: ${job.property.gate}` : ""}{job.property.pets ? ` · Pets: ${job.property.pets}` : ""}{job.property.estate ? ` · Estate: ${job.property.estate}` : ""}
        {job.bundle_laundry && <p className="mt-1 font-medium text-brand-dark">Home Complete: collect the laundry bag and return last time&apos;s clean laundry.</p>}
        {job.lines?.length ? <p className="mt-1">Job: {job.lines.map((l) => `${l.label}${l.qty > 1 ? ` × ${l.qty}` : ""}`).join(", ")}</p> : null}
      </div>
      {job.balance_due_kobo > 0 && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">Balance of {nairaK(job.balance_due_kobo)} is unpaid. Do not start: ask the customer to pay in the app, or call the office.</p>}

      {["scheduled", "on_the_way"].includes(job.status) && lead && (
        <div className="space-y-2">
          {job.status === "scheduled" && <button type="button" className="btn-secondary" disabled={busy} onClick={() => go(() => crewOnWay(job.id))}>We are on the way</button>}
          <div className="flex flex-wrap items-end gap-2">
            <div><label className={labelCls}>Customer&apos;s arrival code</label><input inputMode="numeric" maxLength={4} className={inputCls + " w-28 font-mono tracking-widest"} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></div>
            <button type="button" className="btn-primary" disabled={busy || code.length !== 4} onClick={() => go(() => crewArrive(job.id, code))}>Start job</button>
          </div>
          <button type="button" className="text-sm underline" onClick={() => setPanel(panel === "noshow" ? "" : "noshow")}>Could not get in</button>
        </div>
      )}
      {["scheduled", "on_the_way"].includes(job.status) && !lead && <p className="text-sm text-ink-soft">Your lead starts the job with the customer&apos;s code.</p>}

      {job.status === "in_progress" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">1. Before photos ({job.before} saved)</p>
            <PhotoUpload folder={folder} max={20} value={before} onChange={(p) => { setBefore(p); void savePhotos("before", p); }} label="Take before photos" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">2. Checklist</p>
            {list.length === 0 && <p className="text-xs text-ink-mute">No checklist for this job.</p>}
            {list.map((x, i) => <label key={i} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={x.done} onChange={() => toggle(i)} /> <span className={x.done ? "line-through text-ink-mute" : ""}>{x.item}</span></label>)}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">3. After photos ({job.after} saved)</p>
            <PhotoUpload folder={folder} max={20} value={after} onChange={(p) => { setAfter(p); void savePhotos("after", p); }} label="Take after photos" />
          </div>
          {(job.extras ?? []).map((e) => <p key={e.id} className="text-sm">Extra work {nairaK(e.amount_kobo)}: <strong>{e.status === "pending" ? "waiting for the customer" : e.status}</strong></p>)}
          {lead && (
            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-sm font-medium">4. Finish</p>
              <p className="text-xs text-ink-soft">Walk round with the customer. If they are happy, ask for their completion code. If they are not home, finish without a code and they sign off in the app.</p>
              <div className="flex flex-wrap items-end gap-2">
                <div><label className={labelCls}>Completion code</label><input inputMode="numeric" maxLength={4} className={inputCls + " w-28 font-mono tracking-widest"} value={doneCode} onChange={(e) => setDoneCode(e.target.value.replace(/\D/g, ""))} /></div>
                <button type="button" className="btn-primary" disabled={busy || pendingExtra || (doneCode.length > 0 && doneCode.length !== 4)} onClick={() => go(() => crewFinish(job.id, doneCode))}>{doneCode ? "Finish and sign off" : "Finish without code"}</button>
              </div>
              {pendingExtra && <p className="text-xs text-amber-800">Waiting for the customer to answer the extra-work request.</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {lead && <button type="button" className="text-sm underline" onClick={() => setPanel(panel === "extra" ? "" : "extra")}>Found extra work</button>}
            <button type="button" className="text-sm underline" onClick={() => setPanel(panel === "issue" ? "" : "issue")}>Report a problem</button>
          </div>
        </div>
      )}

      {panel === "extra" && (
        <div className="space-y-2 rounded-md border border-line p-3">
          <p className="text-sm font-medium">Extra work (the customer must approve in the app first)</p>
          {addons.map((a) => (
            <div key={a.code} className="flex items-center justify-between gap-2 text-sm"><span>{a.label} <span className="text-xs text-ink-mute">{nairaK(a.price_kobo)}</span></span>
              <input type="number" min={0} max={20} className="w-16 rounded-md border border-line px-2 py-1" value={extraQty[a.code] ?? 0} onChange={(e) => setExtraQty({ ...extraQty, [a.code]: Math.max(0, Math.min(20, Math.round(Number(e.target.value) || 0))) })} /></div>
          ))}
          <div className="grid gap-2 sm:grid-cols-3">
            <input className={inputCls + " !mt-0"} placeholder="Other work (describe)" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} maxLength={120} />
            <input className={inputCls + " !mt-0"} inputMode="numeric" placeholder="Price ₦" value={customNaira} onChange={(e) => setCustomNaira(e.target.value.replace(/\D/g, ""))} />
            <input className={inputCls + " !mt-0"} inputMode="numeric" placeholder="Extra minutes" value={customMin} onChange={(e) => setCustomMin(e.target.value.replace(/\D/g, ""))} />
          </div>
          <button type="button" className="btn-secondary" disabled={busy} onClick={async () => { const r = await go(() => crewExtra(job.id, Object.fromEntries(Object.entries(extraQty).filter(([, q]) => q > 0)), customLabel, Number(customNaira || 0) * 100, Number(customMin || 0))); if (r.ok) setPanel(""); }}>Send to customer</button>
        </div>
      )}
      {panel === "issue" && (
        <div className="space-y-2 rounded-md border border-red-200 p-3">
          <select className={inputCls} value={issueKind} onChange={(e) => setIssueKind(e.target.value)}>
            <option value="damage">Something got damaged or broken</option>
            <option value="unsafe">Unsafe to work (stop the job)</option>
            <option value="other">Other problem</option>
          </select>
          <textarea className={inputCls} rows={3} value={issueText} onChange={(e) => setIssueText(e.target.value)} placeholder="What happened?" />
          <PhotoUpload folder={folder} value={issuePhotos} onChange={setIssuePhotos} label="Add photos" />
          <button type="button" className="btn-secondary" disabled={busy || issueText.trim().length < 3} onClick={async () => { const r = await go(() => crewIssue(job.id, issueKind, issueText, issuePhotos)); if (r.ok) setPanel(""); }}>Send to office</button>
        </div>
      )}
      {panel === "noshow" && (
        <div className="space-y-2 rounded-md border border-line p-3">
          <input className={inputCls} value={noShowNote} onChange={(e) => setNoShowNote(e.target.value)} placeholder="What happened? (no one home, no water, wrong address…)" />
          <p className="text-xs text-ink-mute">Call the customer and wait 20 minutes first.</p>
          <button type="button" className="btn-secondary" disabled={busy || noShowNote.trim().length < 3} onClick={async () => { const r = await go(() => crewNoShow(job.id, noShowNote)); if (r.ok) setPanel(""); }}>Record and leave</button>
        </div>
      )}
      <Msg m={m} />
    </div>
  );
}
