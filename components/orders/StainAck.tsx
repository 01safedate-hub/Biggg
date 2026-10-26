"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { acknowledgeStain } from "@/app/orders/actions";

export function StainAck({ photoId, orderId }: { photoId: string; orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button type="button" className="btn-secondary !px-3 !py-1" disabled={busy} onClick={async () => { setBusy(true); await acknowledgeStain(photoId, orderId); setBusy(false); router.refresh(); }}>Noted</button>;
}
