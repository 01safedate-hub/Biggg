"use client";

import { useState } from "react";
import { changeStatus } from "@/app/admin/staff/actions";

export function CustomerStatus({ id, status }: { id: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function go(next: "active" | "restricted") {
    let reason = "";
    if (next === "restricted") { reason = window.prompt("Why is this customer being restricted?") ?? ""; if (!reason) return; }
    setBusy(true); setMsg(null);
    const r = await changeStatus(id, next, reason);
    setBusy(false); setMsg(r.ok ? null : r.message);
  }
  return (
    <span className="flex items-center gap-2">
      {status === "active" ? <button className="btn-secondary !px-3 !py-1" disabled={busy} onClick={() => go("restricted")}>Restrict</button>
        : <button className="btn-secondary !px-3 !py-1" disabled={busy} onClick={() => go("active")}>Restore</button>}
      {msg && <span role="alert" className="text-xs text-red-700">{msg}</span>}
    </span>
  );
}
