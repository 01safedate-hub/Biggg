"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEnabledPaymentProviders } from "@/components/orders/useEnabledPaymentProviders";

export function ExtraClothesPayButton({ pickupId }: { pickupId: string }) {
  const { providers, loading: providersLoading } = useEnabledPaymentProviders();
  const [provider, setProvider] = useState<"paystack" | "flutterwave">("paystack");
  const activeProvider = providers.includes(provider) ? provider : providers[0] ?? "paystack";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function pay() {
    if (busy) return;
    if (!providers.includes(activeProvider)) { setMessage("Online payments are currently unavailable. Please contact LaundryPoint."); return; }
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("pay-init", { body: { purpose: "extra_clothes", pickup_id: pickupId, provider: activeProvider } });
      if (error) {
        let code = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") { try { code = (await ctx.json())?.error ?? code; } catch { /* keep */ } }
        if (code === "provider_not_enabled") throw new Error("That payment method is switched off. Choose an available method.");
        if (code === "payment_availability_unavailable") throw new Error("We could not check payment availability. Please try again.");
        throw new Error("Could not start payment. Please try again.");
      }
      const result = data as { url?: string; error?: string } | null;
      if (!result?.url) throw new Error(result?.error || "Could not start payment.");
      window.location.assign(result.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not start payment.");
      setBusy(false);
    }
  }
  return <div className="space-y-3">{providersLoading ? <p className="text-sm text-ink-soft">Checking available payment methods…</p> : providers.length === 0 ? <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Online payments are currently unavailable. Please contact LaundryPoint.</p> : <div className="flex flex-wrap gap-4 text-sm">{providers.map((p) => <label key={p} className="flex items-center gap-2"><input type="radio" name={`provider-${pickupId}`} checked={activeProvider === p} onChange={() => setProvider(p)} /> {p === "paystack" ? "Paystack" : "Flutterwave"}</label>)}</div>}<button type="button" className="btn-primary" onClick={pay} disabled={busy || providersLoading || providers.length === 0}>{busy ? "Opening secure checkout…" : "Pay extra-clothes bill"}</button>{message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null}</div>;
}
