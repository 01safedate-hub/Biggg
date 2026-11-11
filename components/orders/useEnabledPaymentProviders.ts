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
      // Use the SECURITY DEFINER RPC: customers must not have direct read
      // access to money_points because it also contains private finance details.
      // Cast only the RPC surface because this function is not yet in generated DB types.
      const client = createClient() as unknown as {
        rpc: (name: string) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
      const { data, error } = await client.rpc("active_payment_providers");
      if (!alive) return;
      const valid: OnlinePaymentProvider[] = !error && Array.isArray(data)
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
