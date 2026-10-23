"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Keeps a live screen current (for example while a payment is confirming). Pauses when the tab is hidden. */
export function AutoRefresh({ seconds = 6 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
