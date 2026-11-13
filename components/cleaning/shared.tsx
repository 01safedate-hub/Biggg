"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEnabledPaymentProviders } from "@/components/orders/useEnabledPaymentProviders";
import { safeFileName } from "@/lib/cleaning";
import { startCleaningPayment, verifyCleaningPayment } from "@/app/cleaning/actions";

export type R = { ok: boolean; message: string };

export function Msg({ m }: { m: R | null }) {
  if (!m || !m.message) return null;
  return <p role={m.ok ? "status" : "alert"} className={`rounded-md border p-2 text-sm ${m.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{m.message}</p>;
}

// Uploads photos to the private cleaning bucket under a folder the database accepts.
export function PhotoUpload({ folder, max = 10, value, onChange, label = "Add photos" }: { folder: string; max?: number; value: string[]; onChange: (paths: string[]) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr("");
    const room = max - value.length;
    if (room <= 0) { setErr(`You can add up to ${max} photos.`); return; }
    setBusy(true);
    const supabase = createClient();
    const added: string[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      if (!/^image\/(jpeg|png|webp|heic)$/.test(f.type)) { setErr("Use JPG, PNG, WEBP or HEIC photos."); continue; }
      if (f.size > 8 * 1024 * 1024) { setErr("Each photo must be under 8 MB."); continue; }
      const path = `${folder.replace(/\/$/, "")}/${safeFileName(f.name)}`;
      const { error } = await supabase.storage.from("cleaning-photos").upload(path, f, { contentType: f.type, upsert: false });
      if (error) { setErr("A photo could not be uploaded. Please try again."); continue; }
      added.push(path);
    }
    setBusy(false);
    if (added.length) onChange([...value, ...added]);
  }
  return (
    <div className="space-y-2">
      <label className="btn-secondary inline-flex cursor-pointer items-center">
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" multiple className="sr-only" disabled={busy} onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
        {busy ? "Uploading…" : label}
      </label>
      {value.length > 0 && <p className="text-xs text-ink-soft">{value.length} photo{value.length === 1 ? "" : "s"} added. <button type="button" className="underline" onClick={() => onChange([])}>Remove all</button></p>}
      {err && <p role="alert" className="text-xs text-red-700">{err}</p>}
    </div>
  );
}

// Online payment for one cleaning bill.
export function PayInvoice({ invoiceId, label = "Pay now" }: { invoiceId: string; label?: string }) {
  const { providers, loading } = useEnabledPaymentProviders();
  const [provider, setProvider] = useState<"paystack" | "flutterwave">("paystack");
  const active = providers.includes(provider) ? provider : providers[0] ?? "paystack";
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);
  async function pay() {
    if (busy) return;
    setBusy(true); setM(null);
    const r = await startCleaningPayment(invoiceId, active);
    if (r.ok && r.url) { window.location.assign(r.url); return; }
    setBusy(false); setM(r);
  }
  if (loading) return <p className="text-sm text-ink-soft">Checking payment methods…</p>;
  if (providers.length === 0) return <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Online payment is switched off right now. Call or WhatsApp 0913 258 4627 to pay by transfer.</p>;
  return (
    <div className="space-y-2">
      {providers.length > 1 && <div className="flex flex-wrap gap-4 text-sm">{providers.map((p) => <label key={p} className="flex items-center gap-2"><input type="radio" name={`prov-${invoiceId}`} checked={active === p} onChange={() => setProvider(p)} /> {p === "paystack" ? "Paystack" : "Flutterwave"}</label>)}</div>}
      <button type="button" className="btn-primary" onClick={pay} disabled={busy}>{busy ? "Opening secure checkout…" : label}</button>
      <Msg m={m} />
    </div>
  );
}

// Shown after returning from the payment page.
export function VerifyCleaningPayment({ reference }: { reference: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<R | null>(null);
  const once = useRef(false);
  async function check() {
    setBusy(true);
    const r = await verifyCleaningPayment(reference);
    setBusy(false); setM(r);
    if ((r.settled ?? 0) > 0) router.refresh();
  }
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const t = setTimeout(check, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="card space-y-2 border-brand/30 p-4">
      <p className="text-sm">Welcome back. We are confirming your payment.</p>
      <button type="button" className="btn-secondary" disabled={busy} onClick={check}>{busy ? "Checking…" : "Check my payment"}</button>
      <Msg m={m} />
    </div>
  );
}
