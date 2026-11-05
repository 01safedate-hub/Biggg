"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resendAgentReferralInvite } from "@/app/staff/(app)/referral-actions";

export function AgentReferralInviteRetry({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function retry() {
    setBusy(true);
    setMessage("");
    const result = await resendAgentReferralInvite(applicationId);
    setBusy(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => void retry()}>
        {busy ? "Sending…" : "Send invitation"}
      </button>
      {message && <p role="status" className="text-xs text-ink-soft">{message}</p>}
    </div>
  );
}
