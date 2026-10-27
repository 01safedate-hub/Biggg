"use client";

import { useState } from "react";
import { checkInForShift } from "@/app/staff/(app)/attendance-actions";

export function ShiftCheckIn() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function checkIn() {
    if (!navigator.geolocation) { setMessage("This browser does not support location check-in."); return; }
    setBusy(true); setMessage("");
    navigator.geolocation.getCurrentPosition(async position => {
      const result = await checkInForShift(position.coords.latitude, position.coords.longitude);
      setBusy(false); setMessage(result.message);
      if (result.ok) window.location.reload();
    }, error => {
      setBusy(false);
      setMessage(error.code === error.PERMISSION_DENIED ? "Location permission is required. Allow location access in your browser settings and try again." : "Could not get your location. Check GPS/location services and try again.");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  return <div className="space-y-2"><button type="button" className="btn-primary" disabled={busy} onClick={checkIn}>{busy ? "Checking location…" : "Check in with GPS"}</button>{message && <p role="status" className="text-sm text-ink-soft">{message}</p>}</div>;
}