"use client";

import { useState } from "react";
import { sendTestEmail } from "@/app/admin/more-actions";

export function SendTestEmail() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <p className="max-w-xl text-sm text-ink-soft">Not sure email is working? Send a test message to your own address. If it arrives, customers and staff will get theirs too.</p>
      <div className="flex flex-col items-end gap-1">
        <button type="button" className="btn-secondary" disabled={busy} onClick={async () => { setBusy(true); setMsg(null); setMsg(await sendTestEmail()); setBusy(false); }}>{busy ? "Queuing" : "Send me a test email"}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`max-w-sm text-right text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.message}</p>}
      </div>
    </div>
  );
}
