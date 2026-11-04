"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SubscriptionPaymentReturn({ reference }: { reference: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("Checking your payment securely…");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.functions.invoke("pay-verify", { body: { reference } });
        if (error) throw new Error(error.message || "Payment verification is temporarily unavailable.");
        if (cancelled) return;
        const result = data as { checked?: number; settled?: number; message?: string } | null;
        if ((result?.settled ?? 0) > 0) {
          setMessage("Payment confirmed. Your subscription is being activated.");
          router.refresh();
        } else if (result?.message === "no_pending_payment") {
          setMessage("No pending payment was found for this reference. If you have just paid, allow a moment for the provider notification and refresh this page.");
        } else {
          setMessage("Your payment is not confirmed yet. You can retry this check shortly; your plan will only activate after provider confirmation.");
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not verify your payment.");
      }
    }
    void verify();
    return () => { cancelled = true; };
  }, [reference, retry, router]);

  return (
    <section className="card space-y-3 border border-line p-4" aria-live="polite">
      <p className="text-sm">{message}</p>
      <button type="button" className="btn-secondary" onClick={() => setRetry((value) => value + 1)}>Check payment again</button>
    </section>
  );
}
