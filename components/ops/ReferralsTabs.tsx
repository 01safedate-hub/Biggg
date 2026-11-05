"use client";

import { useState, type ReactNode } from "react";

export function ReferralsTabs({ customerContent, agentContent }: {
  customerContent: ReactNode;
  agentContent: ReactNode;
}) {
  const [active, setActive] = useState<"customers" | "agents">("customers");
  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 rounded-xl border border-line bg-canvas p-1" role="tablist" aria-label="Referral types">
        <button type="button" role="tab" id="customer-referrals-tab" aria-selected={active === "customers"} aria-controls="customer-referrals-panel"
          onClick={() => setActive("customers")}
          className={`rounded-lg px-4 py-3 text-sm font-semibold transition ${active === "customers" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>
          Customer referrals
        </button>
        <button type="button" role="tab" id="agent-referrals-tab" aria-selected={active === "agents"} aria-controls="agent-referrals-panel"
          onClick={() => setActive("agents")}
          className={`rounded-lg px-4 py-3 text-sm font-semibold transition ${active === "agents" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>
          Agent referrals
        </button>
      </div>
      {active === "customers" ? (
        <div role="tabpanel" id="customer-referrals-panel" aria-labelledby="customer-referrals-tab" className="space-y-6">
          {customerContent}
        </div>
      ) : (
        <div role="tabpanel" id="agent-referrals-panel" aria-labelledby="agent-referrals-tab" className="space-y-6">
          {agentContent}
        </div>
      )}
    </section>
  );
}
