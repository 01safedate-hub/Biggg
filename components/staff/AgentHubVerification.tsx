"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type HubStatus = {
  agent_type?: string | null; hub_visit_at?: string | null; hub_distance_m?: number | null;
  secretary_verified_at?: string | null; orientation_completed_at?: string | null;
  agreement_accepted_at?: string | null; nin_last4?: string | null;
  hub_lat?: number | null; hub_lng?: number | null; hub_name?: string | null;
  items?: { key: string; label: string; checked: boolean }[];
};

export function AgentHubVerification({ initial }: { initial: HubStatus }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = createClient();

  async function upload(file: File, kind: "agent-nin" | "hub-face") {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Please sign in again.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a JPG, PNG or WebP image.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller.");
    const path = `${auth.user.id}/${kind}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("staff-docs").upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    if (kind === "agent-nin") {
      const { error: saveError } = await supabase.rpc("agent_set_nin_document_path", { _path: path });
      if (saveError) throw saveError;
    }
    return path;
  }

  async function submitVisit(form: FormData) {
    setBusy(true); setMessage("");
    try {
      const file = form.get("face") as File;
      if (!file || !file.size) throw new Error("Take or select a fresh face photo at the hub.");
      if (!navigator.geolocation) throw new Error("This device does not provide location.");
      const path = await upload(file, "hub-face");
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
      const { error } = await supabase.rpc("agent_confirm_hub_visit", { _lat: pos.coords.latitude, _lng: pos.coords.longitude, _face_photo_path: path });
      if (error) throw error;
      const { data, error: statusError } = await supabase.rpc("agent_hub_status");
      if (!statusError && data) setStatus(data as unknown as HubStatus);
      setMessage("Hub attendance recorded. Ask the secretary to check your original NIN and complete your orientation.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not record the hub visit."); }
    finally { setBusy(false); }
  }

  async function uploadNin(form: FormData) {
    setBusy(true); setMessage("");
    try {
      const file = form.get("nin") as File;
      if (!file || !file.size) throw new Error("Choose a clear image of your NIN document.");
      await upload(file, "agent-nin");
      setMessage("NIN document uploaded securely. Only a super admin can view the stored document.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "NIN upload failed."); }
    finally { setBusy(false); }
  }

  async function acceptAgreement() {
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.rpc("agent_accept_agreement");
      if (error) throw error;
      const { data } = await supabase.rpc("agent_hub_status");
      if (data) setStatus(data as unknown as HubStatus);
      setMessage("Agreement acceptance recorded.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Agreement could not be accepted."); }
    finally { setBusy(false); }
  }

  const maps = status.hub_lat != null && status.hub_lng != null ? `https://maps.google.com/?q=${status.hub_lat},${status.hub_lng}` : null;
  return <div className="space-y-5">
    <section className="card space-y-3 p-5">
      <h2 className="text-lg font-semibold">1. Upload your NIN document</h2>
      <p className="text-sm text-ink-soft">Bring the original document to the hub. The uploaded copy is private and reviewed by a super admin.</p>
      <form action={uploadNin} className="space-y-3">
        <input name="nin" type="file" accept="image/jpeg,image/png,image/webp" required className="block w-full text-sm" />
        <button className="btn-primary" disabled={busy}>Upload NIN document</button>
      </form>
      <p className="text-xs text-ink-mute">NIN on file: {status.nin_last4 ? `•••••••${status.nin_last4}` : "Not shown / not yet confirmed"}</p>
    </section>
    <section className="card space-y-3 p-5">
      <h2 className="text-lg font-semibold">2. Confirm your arrival at the hub</h2>
      <p className="text-sm text-ink-soft">You must be physically within 150 metres of your assigned hub. Allow precise location and take a fresh face photo during this visit.</p>
      <p className="text-sm">Hub: <strong>{status.hub_name ?? "Not assigned"}</strong></p>
      {maps && <a className="underline text-sm" href={maps} target="_blank" rel="noreferrer">Open hub location in Google Maps</a>}
      <form action={submitVisit} className="space-y-3">
        <label className="block text-sm font-medium">Fresh face photo taken at the hub
          <input className="mt-1 block w-full text-sm" type="file" name="face" accept="image/jpeg,image/png,image/webp" capture="user" required />
        </label>
        <button className="btn-primary" disabled={busy || !status.hub_lat || !status.hub_lng}>I am at the hub — record attendance</button>
      </form>
      {status.hub_visit_at && <p className="text-sm text-emerald-800">Visit recorded: {new Date(status.hub_visit_at).toLocaleString()} ({status.hub_distance_m} m from hub).</p>}
    </section>
    <section className="card space-y-3 p-5">
      <h2 className="text-lg font-semibold">3. Identity check and orientation</h2>
      <p className="text-sm">Secretary identity check: <strong>{status.secretary_verified_at ? "Completed" : "Waiting at hub"}</strong></p>
      <ul className="space-y-2 text-sm">{(status.items ?? []).map((item) => <li key={item.key} className="flex gap-2"><span aria-hidden="true">{item.checked ? "✓" : "○"}</span><span>{item.label}</span></li>)}</ul>
      <p className="text-sm">Orientation: <strong>{status.orientation_completed_at ? "Completed" : "Pending"}</strong></p>
    </section>
    <section className="card space-y-3 p-5">
      <h2 className="text-lg font-semibold">4. Agent agreement</h2>
      <p className="text-sm text-ink-soft">By accepting, you confirm you understand that all customer payments are made in-app, you follow the garment-count and photo process, and commission follows LaundryPoint’s current rules. The secretary must complete your identity check and orientation first.</p>
      <button type="button" className="btn-primary" disabled={busy || !status.secretary_verified_at || !status.orientation_completed_at || !!status.agreement_accepted_at} onClick={acceptAgreement}>{status.agreement_accepted_at ? "Agreement accepted" : "I have read and accept the agent agreement"}</button>
    </section>
    {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
  </div>;
}
