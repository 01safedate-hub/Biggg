"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmBatch } from "@/app/my-customs/actions";

export function ConfirmBatch({ customId, order, label }: { customId: string; order: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-2">
      <button className="btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setMsg(null);
        const r = await confirmBatch(customId, order);
        setBusy(false); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh();
      }}>{busy ? "Confirming…" : label}</button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}
    </div>
  );
}
