"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTransportRule, endTransportRule, searchCustomers } from "@/app/staff/(app)/transport/actions";

const field = "mt-1 w-full rounded-md border border-line px-3 py-2 text-sm";
const label = "block text-sm font-medium";

/** Lagos local "YYYY-MM-DDTHH:mm" from a datetime-local input → ISO with +01:00. */
const toIso = (v: string) => (v ? `${v}:00+01:00` : null);

export function TransportRuleForm({ zones, plans }: { zones: { id: string; name: string }[]; plans: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [service, setService] = useState("laundry");
  const [scope, setScope] = useState("all");
  const [target, setTarget] = useState<string>("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; label: string }[]>([]);
  const [picked, setPicked] = useState<string>("");

  async function find(v: string) {
    setQ(v);
    if (v.trim().length < 3) { setFound([]); return; }
    setFound(await searchCustomers(v));
  }

  return (
    <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      start(async () => {
        const r = await createTransportRule({
          label: String(f.get("label") ?? ""), service, scope, target: scope === "all" ? null : target || null,
          legs: String(f.get("legs") ?? "both"), startsAt: toIso(String(f.get("starts") ?? "")), endsAt: toIso(String(f.get("ends") ?? "")),
          message: String(f.get("message") ?? ""),
        });
        setMsg({ ok: r.ok, text: r.message });
        if (r.ok) { (e.target as HTMLFormElement).reset(); setScope("all"); setTarget(""); setPicked(""); setQ(""); setFound([]); router.refresh(); }
      });
    }}>
      <div className="sm:col-span-2"><label htmlFor="label" className={label}>Name (for staff)</label><input id="label" name="label" required minLength={2} maxLength={80} className={field} placeholder="November free pickup promo" /></div>
      <div><label htmlFor="service" className={label}>Service</label><select id="service" value={service} onChange={(e) => { setService(e.target.value); if (e.target.value === "cleaning" && scope === "plan") setScope("all"); }} className={field}><option value="laundry">Laundry pickup and delivery</option><option value="cleaning">Cleaning crew transport</option></select></div>
      <div><label htmlFor="legs" className={label}>What is free</label><select id="legs" name="legs" className={field} defaultValue="both"><option value="both">Pickup and delivery</option><option value="pickup">Pickup only</option><option value="delivery">Delivery only</option></select></div>
      <div><label htmlFor="scope" className={label}>Who gets it</label><select id="scope" value={scope} onChange={(e) => { setScope(e.target.value); setTarget(""); setPicked(""); }} className={field}><option value="all">Everyone</option><option value="zone">One zone</option>{service === "laundry" && <option value="plan">Subscribers on one plan</option>}<option value="customer">One customer</option></select></div>
      <div>
        {scope === "zone" && <><label htmlFor="zone" className={label}>Zone</label><select id="zone" required value={target} onChange={(e) => setTarget(e.target.value)} className={field}><option value="">Choose a zone</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></>}
        {scope === "plan" && <><label htmlFor="plan" className={label}>Plan</label><select id="plan" required value={target} onChange={(e) => setTarget(e.target.value)} className={field}><option value="">Choose a plan</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></>}
        {scope === "customer" && <><label htmlFor="cust" className={label}>Customer (name, phone or email)</label><input id="cust" value={q} onChange={(e) => find(e.target.value)} className={field} autoComplete="off" />
          {picked && <p className="mt-1 text-sm text-emerald-800">Chosen: {picked}</p>}
          {found.length > 0 && !picked && <ul className="mt-1 divide-y divide-line rounded-md border border-line text-sm">{found.map((c) => <li key={c.id}><button type="button" className="w-full px-3 py-2 text-left hover:bg-canvas" onClick={() => { setTarget(c.id); setPicked(c.label); setFound([]); }}>{c.label}</button></li>)}</ul>}</>}
      </div>
      <div><label htmlFor="starts" className={label}>Starts (leave empty for now)</label><input id="starts" name="starts" type="datetime-local" className={field} /></div>
      <div><label htmlFor="ends" className={label}>Ends (leave empty to run until you end it)</label><input id="ends" name="ends" type="datetime-local" className={field} /></div>
      {(scope === "all" || scope === "zone") && <div className="sm:col-span-2"><label htmlFor="message" className={label}>Message for customers (optional, shown on the booking page and website)</label><input id="message" name="message" maxLength={140} className={field} placeholder="Free pickup and delivery in Ifite this week" /></div>}
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending || (scope !== "all" && !target)}>{pending ? "Saving…" : "Save rule"}</button>
        {msg && <p role="status" className={`text-sm ${msg.ok ? "text-emerald-800" : "text-red-700"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}

export function EndRuleButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sure, setSure] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!sure) return <button type="button" className="btn-secondary" onClick={() => setSure(true)}>End rule</button>;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2"><button type="button" className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await endTransportRule(id); if (r.ok) router.refresh(); else setErr(r.message); })}>{pending ? "Ending…" : "Yes, end it"}</button><button type="button" className="btn-secondary" onClick={() => setSure(false)}>Keep</button></div>
      {err && <p role="alert" className="text-xs text-red-700">{err}</p>}
    </div>
  );
}
