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
      const { data, error } = await createClient()
        .from("money_points")
        .select("name")
        .eq("kind", "online")
        .eq("active", true);
      if (!alive) return;
      const valid: OnlinePaymentProvider[] = !error
        ? (data ?? []).flatMap((point) => {
            const name = String(point.name ?? "").toLowerCase();
            if (name.includes("paystack")) return ["paystack" as const];
            if (name.includes("flutterwave")) return ["flutterwave" as const];
            return [];
          })
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
