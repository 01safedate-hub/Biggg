"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PHOTO_PROBLEM, compressImage, extFor } from "@/lib/compress-image";

/** Captures a photo with the camera right now and uploads it privately. A picture picked from the gallery is not accepted on phones that support the camera. */
export function LivePhoto({ userId, currentUrl, onUploaded, disabled }: { userId: string; currentUrl: string | null; onUploaded: (path: string) => void; disabled?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canCamera = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setLive(false); };
  useEffect(() => stop, []);

  async function start() {
    setErr(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1024 } }, audio: false });
      stream.current = s;
      setLive(true);
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; void video.current.play(); } });
    } catch {
      setErr("The camera could not be opened. Allow camera access in your browser, then try again.");
    }
  }

  async function upload(raw: Blob) {
    setBusy(true);
    let blob: Blob;
    try { blob = await compressImage(raw); } catch { setBusy(false); return setErr(PHOTO_PROBLEM); }
    const path = `${userId}/photo-${Date.now()}.${extFor(blob)}`;
    const { error } = await createClient().storage.from("staff-docs").upload(path, blob, { contentType: blob.type, upsert: false });
    setBusy(false);
    if (error) return setErr("The photo could not be uploaded. Please try again.");
    setPreview(URL.createObjectURL(blob));
    onUploaded(path);
  }

  function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const w = Math.min(720, v.videoWidth);
    const h = Math.round((v.videoHeight * w) / v.videoWidth);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(v, 0, 0, w, h);
    stop();
    c.toBlob((b) => b && void upload(b), "image/jpeg", 0.9);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 15_000_000) return setErr("Use a JPG, PNG or WebP photo.");
    await upload(f);
  }

  return (
    <div className="space-y-3">
      <div className="grid aspect-square w-44 place-items-center overflow-hidden rounded-xl border border-line bg-canvas">
        {live ? <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
          : preview ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={preview} alt="Your photo" className="h-full w-full object-cover" />
          : <span className="px-3 text-center text-xs text-ink-mute">No photo yet</span>}
      </div>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {live ? (
          <>
            <button type="button" className="btn-primary" onClick={snap} disabled={busy}>Take photo</button>
            <button type="button" className="btn-secondary" onClick={stop}>Cancel</button>
          </>
        ) : (
          <>
            {canCamera && <button type="button" className="btn-secondary" onClick={start} disabled={busy || disabled}>{preview ? "Retake with camera" : "Open camera"}</button>}
            {!canCamera && !disabled && (
              <label className="btn-secondary cursor-pointer">
                {busy ? "Uploading" : "Take photo"}
                <input type="file" accept="image/*" capture="user" className="sr-only" onChange={onFile} />
              </label>
            )}
          </>
        )}
      </div>
      {busy && <p className="text-xs text-ink-mute">Uploading</p>}
    </div>
  );
}
