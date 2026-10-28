"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ExtraClothesPayButton({ pickupId }: { pickupId: string }) {
  const [provider, setProvider] = useState<"paystack" | "flutterwave">("paystack");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function pay() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("pay-init", { body: { purpose: "extra_clothes", pickup_id: pickupId, provider } });
      if (error) throw new Error(error.message || "Could not start payment.");
      const result = data as { url?: string; error?: string } | null;
      if (!result?.url) throw new Error(result?.error || "Could not start payment.");
      window.location.assign(result.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not start payment.");
      setBusy(false);
    }
  }
  return <div className="space-y-3"><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" name={`provider-${pickupId}`} checked={provider === "paystack"} onChange={() => setProvider("paystack")} /> Paystack</label><label className="flex items-center gap-2"><input type="radio" name={`provider-${pickupId}`} checked={provider === "flutterwave"} onChange={() => setProvider("flutterwave")} /> Flutterwave</label></div><button type="button" className="btn-primary" onClick={pay} disabled={busy}>{busy ? "Opening secure checkout…" : "Pay extra-clothes bill"}</button>{message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null}</div>;
}
