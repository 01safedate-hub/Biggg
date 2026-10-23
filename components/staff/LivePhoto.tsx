"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

  async function upload(blob: Blob) {
    setBusy(true);
    const path = `${userId}/photo-${Date.now()}.jpg`;
    const { error } = await createClient().storage.from("staff-docs").upload(path, blob, { contentType: "image/jpeg", upsert: false });
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
    c.toBlob((b) => b && void upload(b), "image/jpeg", 0.85);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 5_000_000) return setErr("Use a JPG, PNG or WebP photo under 5 MB.");
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
