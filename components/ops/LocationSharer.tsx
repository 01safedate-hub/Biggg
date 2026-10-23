"use client";

import { useEffect, useRef, useState } from "react";
import { pingLocation } from "@/app/staff/(app)/ops-actions";

/** While the agent is on the way, shares their position so the customer can follow. Only works while this page is open. */
export function LocationSharer({ orderId }: { orderId: string }) {
  const [state, setState] = useState<"starting" | "sharing" | "denied" | "off">("starting");
  const last = useRef(0);
  useEffect(() => {
    if (!navigator.geolocation) { setState("off"); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setState("sharing");
        const now = Date.now();
        if (now - last.current < 10000) return;
        last.current = now;
        void pingLocation(orderId, p.coords.latitude, p.coords.longitude, p.coords.accuracy);
      },
      (e) => setState(e.code === 1 ? "denied" : "off"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [orderId]);
  const text = { starting: "Starting location sharing", sharing: "Sharing your location with the customer. Keep this page open while you travel.", denied: "Location is blocked. Allow it in your browser settings so the customer can follow you.", off: "Location sharing is not available on this phone." }[state];
  return <p role="status" className={`rounded-md border p-3 text-sm ${state === "sharing" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-line bg-canvas text-ink-soft"}`}>{text}</p>;
}
