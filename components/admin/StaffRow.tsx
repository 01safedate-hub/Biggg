"use client";

import Link from "next/link";
import { useState } from "react";
import { changeRoles, changeStatus, resendInvite } from "@/app/admin/staff/actions";
import { ROLE_NAME, STAFF_ROLES, type StaffRowData } from "@/lib/staff";
import { longDate } from "@/lib/money";
import { inputCls } from "./ui";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  restricted: "bg-amber-50 text-amber-800 border-amber-200",
  dismissed: "bg-slate-100 text-slate-600 border-slate-200",
};
const STATUS_LABEL: Record<string, string> = { active: "Active", restricted: "Suspended", dismissed: "Dismissed" };

export function StaffRow({ s, isMe, onboarding }: { s: StaffRowData; isMe: boolean; onboarding: string }) {
  const [editing, setEditing] = useState(false);
  const [roles, setRoles] = useState<string[]>(s.roles);
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState<"restricted" | "dismissed" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; message: string }>, done?: () => void) {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false); setMsg({ ok: r.ok, text: r.message });
    if (r.ok) done?.();
  }

  const saveRoles = () => {
    if (roles.length === 0 && !window.confirm("Removing every role makes this person a customer with no staff access. Continue?")) return;
    if (roles.includes("super_admin") && !s.roles.includes("super_admin") && !window.confirm("A super admin has full control. Continue?")) return;
    run(() => changeRoles(s.id, roles), () => setEditing(false));
  };

  return (
    <article className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{s.full_name || "No name"} {isMe && <span className="ml-1 text-xs font-medium text-ink-mute">(you)</span>}</p>
          <p className="text-sm text-ink-soft">{s.email} {s.phone ? `· ${s.phone}` : ""}</p>
          <p className="mt-1 text-xs text-ink-mute">
            {s.accepted ? (s.last_sign_in_at ? `Last signed in ${longDate(s.last_sign_in_at.slice(0, 10))}` : "Account ready") : "Invitation not accepted yet"}
          </p>
        </div>
        <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
      </div>
      <p className="mt-2 text-sm">{s.roles.map((r) => ROLE_NAME[r] ?? r).join(", ")} · <Link href={`/admin/staff/${s.id}`} className="font-medium text-brand-dark hover:underline">Details and pay</Link> {onboarding === "submitted" ? <span className="ml-1 rounded border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Submitted: review</span> : <span className="text-xs text-ink-mute">({onboarding})</span>}</p>
      {s.status !== "active" && s.status_reason && <p className="mt-1 text-sm text-ink-soft">Reason: {s.status_reason}</p>}

      {!isMe && (
        <div className="mt-3 space-y-3">
          {!editing && !asking && (
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => setEditing(true)}>Change roles</button>
              {!s.accepted && <button className="btn-secondary" disabled={busy} onClick={() => run(() => resendInvite(s.id))}>Resend invitation</button>}
              {s.status === "active" && <button className="btn-secondary" onClick={() => setAsking("restricted")}>Suspend</button>}
              {s.status === "active" && <button className="btn-secondary" onClick={() => setAsking("dismissed")}>Dismiss</button>}
              {s.status !== "active" && <button className="btn-primary" disabled={busy} onClick={() => run(() => changeStatus(s.id, "active", ""))}>Restore access</button>}
            </div>
          )}
          {editing && (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                {STAFF_ROLES.map((r) => (
                  <label key={r.key} className="flex items-center gap-2 rounded-md border border-line p-2 text-sm">
                    <input type="checkbox" checked={roles.includes(r.key)} onChange={(e) => setRoles(e.target.checked ? [...roles, r.key] : roles.filter((x) => x !== r.key))} />
                    {r.label}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" disabled={busy} onClick={saveRoles}>{busy ? "Saving" : "Save roles"}</button>
                <button className="btn-secondary" onClick={() => { setEditing(false); setRoles(s.roles); }}>Cancel</button>
              </div>
            </div>
          )}
          {asking && (
            <div className="space-y-2">
              <label htmlFor={`why-${s.id}`} className="block text-sm font-medium">{asking === "restricted" ? "Reason for suspending" : "Reason for dismissing"}</label>
              <textarea id={`why-${s.id}`} rows={2} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
              <p className="text-xs text-ink-mute">They will be signed out of every protected screen straight away and cannot sign in again until you restore access.</p>
              <div className="flex gap-2">
                <button className="btn-primary" disabled={busy} onClick={() => run(() => changeStatus(s.id, asking, reason), () => { setAsking(null); setReason(""); })}>{busy ? "Saving" : "Confirm"}</button>
                <button className="btn-secondary" onClick={() => { setAsking(null); setReason(""); }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
    </article>
  );
}
