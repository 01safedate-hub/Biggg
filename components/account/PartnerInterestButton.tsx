"use client";

import { useState } from "react";
import { registerPartnerInterest } from "@/app/account/partner/actions";

export function PartnerInterestButton({ requested }: { requested: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(requested);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (done) {
    return (
      <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <strong>Request received.</strong> {result?.text ?? "Our team will call or WhatsApp you to arrange your hub visit."}
      </p>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setResult(null);
        const r = await registerPartnerInterest(message);
        setBusy(false);
        setResult({ ok: r.ok, text: r.message });
        if (r.ok) setDone(true);
      }}
    >
      <label className="block text-sm font-medium">
        Anything we should know? <span className="font-normal text-ink-mute">(optional)</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={2}
          className="mt-1 w-full rounded-lg border border-line p-3" placeholder="For example: the area you know well, or the best time to call you." />
      </label>
      <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Sending…" : "I'm interested"}</button>
      {result && !result.ok && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{result.text}</p>}
    </form>
  );
}
