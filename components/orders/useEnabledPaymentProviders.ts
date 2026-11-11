"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type OnlinePaymentProvider = "paystack" | "flutterwave";

/**
 * Read the live provider switches. Polling keeps an already-open checkout in
 * sync with Admin > Money points; failures deliberately fail closed.
 */
export function useEnabledPaymentProviders() {
  const [providers, setProviders] = useState<OnlinePaymentProvider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await createClient().rpc("active_payment_providers");
      if (!alive) return;
      const valid = !error && Array.isArray(data)
        ? data.filter((value): value is OnlinePaymentProvider => value === "paystack" || value === "flutterwave")
        : [];
      setProviders([...new Set(valid)]);
      setLoading(false);
    };
    void load();
    const interval = window.setInterval(() => { void load(); }, 15000);
    return () => { alive = false; window.clearInterval(interval); };
  }, []);

  return { providers, loading };
}
