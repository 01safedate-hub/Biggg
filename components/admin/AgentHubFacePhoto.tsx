"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LivePhoto } from "@/components/staff/LivePhoto";
import { saveAgentHubFacePhoto } from "@/app/admin/staff/[id]/actions";

export function AgentHubFacePhoto({ userId, photoUrl }: { userId: string; photoUrl: string | null }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function uploaded(path: string) {
    setBusy(true);
    setMessage("");
    const result = await saveAgentHubFacePhoto(userId, path);
    setBusy(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  }
  return (
    <section className="card space-y-3 p-5">
      <h2 className="text-lg font-semibold">Fresh face photo at the hub</h2>
      <p className="text-sm text-ink-soft">The secretary must take a new live camera photo during the in-person visit. This is stored separately from the applicant's onboarding selfie.</p>
      <LivePhoto userId={userId} currentUrl={photoUrl} onUploaded={path => void uploaded(path)} disabled={busy} />
      {busy && <p className="text-xs text-ink-mute">Saving photo record…</p>}
      {message && <p role="status" className="text-sm text-ink-soft">{message}</p>}
    </section>
  );
}
