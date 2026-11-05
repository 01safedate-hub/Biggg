"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage, extFor } from "@/lib/compress-image";
import { saveAgentNinDocumentPhoto } from "@/app/admin/staff/[id]/actions";

export function AgentNinDocumentCapture({ userId }: { userId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function capture(file?: File) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 15_000_000) {
      setMessage("Choose a clear JPG, PNG or WebP image under 15 MB.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const blob = await compressImage(file);
      const path = `${userId}/nin-document-${Date.now()}.${extFor(blob)}`;
      const { error } = await createClient().storage.from("staff-docs").upload(path, blob, {
        contentType: blob.type,
        upsert: false,
      });
      if (error) throw new Error("The document photo could not be uploaded.");
      const saved = await saveAgentNinDocumentPhoto(userId, path);
      if (!saved.ok) throw new Error(saved.message);
      setMessage("NIN document photo securely recorded. Only the applicant and super admin can view it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the document photo. Please try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="card space-y-3 p-5">
      <h2 className="text-lg font-semibold">NIN document evidence</h2>
      <p className="text-sm text-ink-soft">At the hub, use the device camera to photograph the applicant's original NIN document. Capture the document clearly and only for identity verification. Secretaries can upload it but cannot view or download the stored image; access is restricted to the applicant and super admin.</p>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="block w-full text-sm" disabled={busy} onChange={e => void capture(e.target.files?.[0])} />
      {busy && <p className="text-xs text-ink-mute">Uploading securely…</p>}
      {message && <p role="status" className="text-sm text-ink-soft">{message}</p>}
    </section>
  );
}
