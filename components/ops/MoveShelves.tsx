"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { moveShelves } from "@/app/staff/(app)/ops-actions";
import { ShelfPicker } from "./ShelfPicker";

export function MoveShelves({ orderId, current, use }: { orderId: string; current: string[]; use: Record<string, number> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string[]>(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!open) return <button type="button" className="text-sm underline" onClick={() => { setPick(current); setOpen(true); setMsg(null); }}>Move</button>;
  return (
    <div className="w-full space-y-2 rounded-lg border border-line bg-white p-3">
      <p className="text-sm font-semibold">Choose the new shelves</p>
      <ShelfPicker value={pick} onChange={setPick} busy={use} />
      <div className="flex gap-2">
        <button type="button" className="btn-primary !px-4 !py-2" disabled={busy || pick.length === 0} onClick={async () => {
          setBusy(true); const r = await moveShelves(orderId, pick); setBusy(false);
          setMsg({ ok: r.ok, text: r.message }); if (r.ok) { setOpen(false); router.refresh(); }
        }}>{busy ? "Saving" : "Save"}</button>
        <button type="button" className="btn-secondary !px-4 !py-2" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}
