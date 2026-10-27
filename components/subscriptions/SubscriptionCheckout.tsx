"use client";

import { useState } from "react";

type Plan = { slug: string; name: string; priceKobo: number; pieces: number | null };

const naira = (kobo: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(kobo / 100);

export function SubscriptionCheckout({ plans }: { plans: Plan[] }) {
  const [provider, setProvider] = useState<"paystack" | "flutterwave">("paystack");
  const [planSlug, setPlanSlug] = useState(plans[0]?.slug ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function pay() {
    if (!planSlug || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/subscription-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan_slug: planSlug, provider }) });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error ?? "Could not start payment. Please try again.");
      window.location.assign(result.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not start payment. Please try again.");
      setBusy(false);
    }
  }

  if (!plans.length) return <p className="card p-5">No monthly plans are available right now. Please try again later.</p>;
  return (
    <section className="card space-y-5 p-5">
      <div className="space-y-2"><label htmlFor="plan" className="block text-sm font-medium">Monthly plan</label><select id="plan" value={planSlug} onChange={e => setPlanSlug(e.target.value)} className="w-full rounded-lg border border-line bg-white p-3">{plans.map(p => <option key={p.slug} value={p.slug}>{p.name} — {naira(p.priceKobo)} / month · {p.pieces ?? "Plan"} pieces</option>)}</select></div>
      <div className="space-y-2"><p className="text-sm font-medium">Payment provider</p><div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm"><input type="radio" name="provider" checked={provider === "paystack"} onChange={() => setProvider("paystack")} /> Paystack</label><label className="flex items-center gap-2 text-sm"><input type="radio" name="provider" checked={provider === "flutterwave"} onChange={() => setProvider("flutterwave")} /> Flutterwave</label></div></div>
      <button type="button" disabled={busy || !planSlug} onClick={pay} className="btn-primary w-full disabled:opacity-60">{busy ? "Opening secure checkout…" : "Pay securely and activate plan"}</button>
      {message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null}
      <p className="text-xs text-ink-mute">The server sets the amount from the active plan. Your plan only activates after provider verification.</p>
    </section>
  );
}
