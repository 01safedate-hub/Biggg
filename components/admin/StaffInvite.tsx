"use client";

import { useState } from "react";
import { inviteStaff } from "@/app/admin/staff/actions";
import { STAFF_ROLES } from "@/lib/staff";
import { inputCls, labelCls } from "./ui";

export function StaffInvite() {
  const [busy, setBusy] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const form = e.currentTarget;
    const f = new FormData(form);
    if (roles.length === 0) return setMsg({ ok: false, text: "Choose at least one role." });
    if (roles.includes("super_admin") && !window.confirm("A super admin has full control, including approving expenses and seeing all money. Continue?")) return;
    setBusy(true);
    const r = await inviteStaff({ email: String(f.get("email") ?? ""), full_name: String(f.get("full_name") ?? ""), phone: String(f.get("phone") ?? ""), roles });
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) { form.reset(); setRoles([]); }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <h2 className="text-lg font-semibold">Add a team member</h2>
      <p className="text-sm text-ink-soft">They get an email to accept and choose their own password. You never see or set it.</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="inv-name" className={labelCls}>Full name</label><input id="inv-name" name="full_name" required minLength={2} className={inputCls} /></div>
        <div><label htmlFor="inv-email" className={labelCls}>Email</label><input id="inv-email" name="email" type="email" required className={inputCls} /></div>
        <div><label htmlFor="inv-phone" className={labelCls}>Phone</label><input id="inv-phone" name="phone" type="tel" required className={inputCls} /></div>
      </div>
      <fieldset>
        <legend className={labelCls}>Role</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {STAFF_ROLES.map((r) => (
            <label key={r.key} className="flex items-start gap-2 rounded-md border border-line p-3 text-sm">
              <input type="checkbox" className="mt-0.5" checked={roles.includes(r.key)} onChange={(e) => setRoles(e.target.checked ? [...roles, r.key] : roles.filter((x) => x !== r.key))} />
              <span><span className="font-medium">{r.label}</span><span className="block text-xs text-ink-mute">{r.note}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <button className="btn-primary" disabled={busy}>{busy ? "Sending" : "Send invitation"}</button>
    </form>
  );
}
