"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { verifyPayments } from "@/app/orders/actions";

export function VerifyPayment({ orderId, auto }: { orderId: string; auto?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const done = useRef(false);
  async function check() {
    setBusy(true); const r = await verifyPayments(orderId); setBusy(false); setMsg(r.message); if (r.settled) router.refresh();
  }
  useEffect(() => {
    if (!auto || done.current) return;
    done.current = true;
    const t = setTimeout(check, 7000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);
  return (
    <div className="space-y-1">
      <button type="button" className="btn-secondary" disabled={busy} onClick={check}>{busy ? "Checking" : "I have paid: check my payment"}</button>
      {msg && <p role="status" className="text-sm text-ink-soft">{msg}</p>}
    </div>
  );
}
