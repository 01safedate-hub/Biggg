"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelPaidOrder, assignAgent, assignDelivery, checkLine, correctLine, hubStep, receiveOrder, redispatch } from "@/app/staff/(app)/ops-actions";
import { naira } from "@/lib/format";

export function AssignForm({ orderId, agents, current, kind = "pickup" }: { orderId: string; agents: { id: string; name: string; open_jobs: number; on_shift?: boolean }[]; current: string | null; kind?: "pickup" | "delivery" }) {
  const router = useRouter();
  const [agent, setAgent] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select aria-label="Agent" value={agent} onChange={(e) => setAgent(e.target.value)} className="rounded-md border border-line px-3 py-2 text-sm">
          <option value="">Choose an agent</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.open_jobs} open{a.on_shift === false ? ", not on shift" : ""})</option>)}
        </select>
        <button className="btn-primary !px-4 !py-2" disabled={busy || !agent || agent === current} onClick={async () => { setBusy(true); setMsg(null); const r = await (kind === "delivery" ? assignDelivery : assignAgent)(orderId, agent); setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh(); }}>{current ? "Reassign" : "Assign"}</button>
      </div>
      {msg && !msg.ok && <p role="alert" className="text-sm text-red-700">{msg.text}</p>}
    </div>
  );
}

type Line = { id: string; name: string; category_name: string | null; qty: number; check_state: string; check_note: string | null };
type Opt = { id: string; name: string; price_kobo: number; category: string };

export function CheckLines({ orderId, lines, options, dueKobo }: { orderId: string; lines: Line[]; options: Opt[]; dueKobo: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [why, setWhy] = useState("");
  const allOk = lines.length > 0 && lines.every((l) => l.check_state === "ok");
  const groups = Array.from(new Set(options.map((o) => o.category)));

  async function ok(id: string) {
    setBusy(id); setErr(null);
    const r = await checkLine(orderId, id, true, "");
    setBusy(null);
    if (r.ok) router.refresh(); else setErr(r.message);
  }
  async function fix(id: string) {
    setBusy(id); setErr(null); setNote(null);
    const r = await correctLine(orderId, id, pick, why);
    setBusy(null);
    if (!r.ok) return setErr(r.message);
    setFixing(null); setPick(""); setWhy("");
    const d = r.due ?? 0;
    setNote(d > 0 ? `Corrected. The customer must now pay ${naira(d)} extra in the app before you can receive this order.` : d < 0 ? `Corrected. The customer is owed ${naira(-d)}; the super admin will refund it.` : "Corrected. The price is unchanged.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {err && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      {note && <p role="status" className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{note}</p>}
      {dueKobo > 0 && <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Waiting for the customer to pay {naira(dueKobo)} extra. This page does not update by itself, so refresh after they pay.</p>}
      <ul className="card divide-y divide-line">
        {lines.map((l) => (
          <li key={l.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-medium">{l.qty} × {l.name}</p><p className="text-xs text-ink-mute">Agent put it in: {l.category_name}</p>
                {l.check_note && <p className="mt-1 text-xs text-ink-soft">{l.check_note}</p>}</div>
              <div className="flex gap-2">
                <button className={`rounded-md border px-3 py-1.5 text-sm font-medium ${l.check_state === "ok" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-line"}`} disabled={busy === l.id} onClick={() => ok(l.id)}>{l.check_state === "ok" ? "Correct ✓" : "Correct"}</button>
                <button className="rounded-md border border-line px-3 py-1.5 text-sm font-medium" onClick={() => { setFixing(fixing === l.id ? null : l.id); setPick(""); setWhy(""); }}>Wrong category</button>
              </div>
            </div>
            {fixing === l.id && (
              <div className="space-y-2 rounded-md bg-canvas p-3">
                <label className="block text-sm font-medium" htmlFor={`pick-${l.id}`}>What is it really?</label>
                <select id={`pick-${l.id}`} value={pick} onChange={(e) => setPick(e.target.value)} className="w-full rounded-md border border-line px-3 py-2 text-sm">
                  <option value="">Choose the right item</option>
                  {groups.map((g) => <optgroup key={g} label={g}>{options.filter((o) => o.category === g).map((o) => <option key={o.id} value={o.id}>{o.name} ({naira(o.price_kobo)})</option>)}</optgroup>)}
                </select>
                <input aria-label="Why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Short reason, for example: this is a duvet" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
                <button className="btn-primary !px-4 !py-2" disabled={busy === l.id || !pick || why.trim().length < 3} onClick={() => fix(l.id)}>Fix and re-bill</button>
                <p className="text-xs text-ink-mute">The price is recalculated. A higher price asks the customer for the difference; a lower price is refunded.</p>
              </div>
            )}
          </li>
        ))}
      </ul>
      <button className="btn-primary" disabled={!allOk || dueKobo > 0 || busy === "recv"} onClick={async () => { setBusy("recv"); const r = await receiveOrder(orderId); setBusy(null); if (r.ok) router.push("/staff/receiving"); else setErr(r.message); }}>Mark as received</button>
      {!allOk && <p className="text-xs text-ink-mute">Every line must be marked correct, or fixed if it is in the wrong category.</p>}
    </div>
  );
}

export function HubButton({ orderId, step, label }: { orderId: string; step: "wash" | "ready"; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="text-right">
      <button className="btn-primary !px-4 !py-2" disabled={busy} onClick={async () => { setBusy(true); setErr(null); const r = await hubStep(orderId, step); setBusy(false); if (r.ok) router.refresh(); else setErr(r.message); }}>{busy ? "Saving" : label}</button>
      {err && <p role="alert" className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
}

export function RedispatchButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button className="btn-secondary !px-4 !py-2" disabled={busy} onClick={async () => { if (!window.confirm("Put this delivery back in the queue? Do this only once the customer has agreed a new time.")) return; setBusy(true); const r = await redispatch(orderId); setBusy(false); if (r.ok) router.refresh(); else setErr(r.message); }}>Try delivery again</button>
      {err && <p role="alert" className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
}

export function CancelPaidForm({ orderId, fareKobo }: { orderId: string; fareKobo: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [keep, setKeep] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button className="text-sm font-medium text-red-700 hover:underline" onClick={() => setOpen(true)}>Cancel this booking</button>;
  return (
    <div className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4">
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={keep} onChange={(e) => setKeep(e.target.checked)} /><span>Keep the pickup fare ({naira(fareKobo)}) because an agent was already sent. Only the delivery part is refunded.</span></label>
      <input aria-label="Reason" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason, for example: customer asked to cancel" className="w-full rounded-md border border-line px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy || note.trim().length < 3} onClick={async () => { setBusy(true); const r = await cancelPaidOrder(orderId, !keep, note); setBusy(false); if (r.ok) router.refresh(); else setErr(r.message); }}>Cancel and refund</button>
        <button className="btn-secondary" onClick={() => setOpen(false)}>Back</button>
      </div>
      <p className="text-xs text-ink-soft">The refund is listed under Payments, Refunds to send. The customer is told.</p>
    </div>
  );
}
