"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelOrder } from "@/app/orders/actions";

export function CancelButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button className="text-sm font-medium text-red-700 hover:underline" onClick={async () => { if (!window.confirm("Cancel this booking?")) return; const r = await cancelOrder(orderId); if (r.ok) router.refresh(); else setErr(r.message); }}>Cancel booking</button>
      {err && <span role="alert" className="ml-2 text-xs text-red-700">{err}</span>}
    </span>
  );
}
