"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { flagStain } from "@/app/staff/(app)/ops-actions";
import { PHOTO_PROBLEM, compressImage, extFor } from "@/lib/compress-image";
import { createClient } from "@/lib/supabase/client";

/** Lets an agent photograph a hard stain on an item. The photo is shrunk under 20 KB on the phone. */
export function StainFlag({ orderId, lines, nameOnly = false, onFlagged }: { orderId: string; lines: { id: string; name: string }[]; nameOnly?: boolean; onFlagged?: (name: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true); setMsg(null);
    try {
      let blob: Blob;
      try { blob = await compressImage(f); } catch { throw new Error(PHOTO_PROBLEM); }
      const path = `${orderId}/${crypto.randomUUID()}.${extFor(blob)}`;
      const { error } = await createClient().storage.from("order-photos").upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw new Error("The photo could not be uploaded. Check your connection and try again.");
      const line = lines.find((l) => l.id === item);
      const r = await flagStain(orderId, nameOnly ? null : line?.id ?? null, line?.name ?? "", path, note);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) { if (line) onFlagged?.(line.name); setNote(""); setItem(""); router.refresh(); }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Something went wrong. Please try again." });
    } finally { setBusy(false); }
  }

  if (!open) return <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>Flag a hard stain</button>;
  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-950">Hard stain: take a clear photo of it</p>
      <label className="block text-sm">Which item?
        <select value={item} onChange={(e) => setItem(e.target.value)} className="mt-1 w-full rounded-md border border-line bg-white px-2 py-2">
          <option value="">Not listed or several items</option>
          {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <label className="block text-sm">What is it? (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="For example: old oil stain on the front" className="mt-1 w-full rounded-md border border-line bg-white px-2 py-2" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className={`btn-primary cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy ? "Saving photo" : "Take photo"}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPhoto} disabled={busy} />
        </label>
        <button type="button" className="text-sm underline" onClick={() => setOpen(false)}>Close</button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-800" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}
