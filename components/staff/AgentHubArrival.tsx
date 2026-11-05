"use client";

import { useState } from "react";
import { recordAgentHubArrival } from "@/app/staff/onboarding/actions";

export function AgentHubArrival() {
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [done,setDone] = useState(false);
  function check() {
    if (!navigator.geolocation) { setMessage("This browser does not support GPS location."); return; }
    setBusy(true); setMessage("");
    navigator.geolocation.getCurrentPosition(async position => {
      const result = await recordAgentHubArrival(position.coords.latitude,position.coords.longitude);
      setBusy(false); setMessage(result.message); setDone(result.ok);
    }, error => {
      setBusy(false);
      setMessage(error.code === error.PERMISSION_DENIED
        ? "Allow location access in your browser settings, then try again."
        : "We could not get a reliable GPS location. Turn on location services and retry.");
    },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  }
  return <section className="card space-y-3 p-5">
    <div><h2 className="text-lg font-semibold">Confirm you are at the LaundryPoint hub</h2>
      <p className="mt-1 text-sm text-ink-soft">When you arrive for your in-person verification, tap below. Your phone’s GPS must place you within 150 metres of the hub saved in Coverage Zones.</p></div>
    <button type="button" className="btn-primary" onClick={check} disabled={busy || done}>{busy ? "Checking GPS location…" : done ? "Hub location confirmed" : "I am at the hub"}</button>
    {message && <p role="status" className={`text-sm ${done ? "text-emerald-700" : "text-ink-soft"}`}>{message}</p>}
  </section>;
}
