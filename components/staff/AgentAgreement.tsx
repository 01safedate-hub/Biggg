"use client";

import { useState } from "react";
import { acceptAgentAgreement } from "@/app/staff/onboarding/actions";

const VERSION = "2026-11-05-v1";

export function AgentAgreement({ initiallyAccepted }: { initiallyAccepted: boolean }) {
  const [accepted, setAccepted] = useState(initiallyAccepted);
  const [checked, setChecked] = useState(initiallyAccepted);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function accept() {
    setBusy(true);
    setMessage("");
    const result = await acceptAgentAgreement(VERSION);
    setBusy(false);
    setMessage(result.message);
    if (result.ok) { setAccepted(true); setChecked(true); }
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Commission agent agreement · Version {VERSION}</p>
        <h2 className="mt-1 text-xl font-bold">LaundryPoint Commission Agent Terms</h2>
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Interim operating draft. This version is provided so onboarding can be tested. LaundryPoint may revise it after legal review; the final approved terms should replace this draft before full commercial rollout.
        </p>
      </div>
      <div className="max-h-96 space-y-4 overflow-y-auto pr-2 text-sm leading-6">
        <section><h3 className="font-semibold">1. Appointment and scope</h3><p>Subject to successful identity verification and written approval, LaundryPoint appoints the applicant as a non-exclusive commission agent to introduce prospective customers and support customer acquisition in areas authorised by LaundryPoint. The agent has no authority to bind LaundryPoint, vary prices, promise services or make commitments on its behalf.</p></section>
        <section><h3 className="font-semibold">2. Registration and verification</h3><p>The applicant must provide accurate personal and contact information, attend the designated hub for in-person identity checks, present valid identity evidence when requested, complete the required orientation and keep their account secure. LaundryPoint may delay or decline activation where information is incomplete, inconsistent or cannot be verified.</p></section>
        <section><h3 className="font-semibold">3. Commission and payment</h3><p>Commission is payable only on qualifying customer transactions that are attributed to the agent under the commission rules and rates displayed or otherwise formally issued by LaundryPoint. Rates, qualifying events, reversals, payment timing and any applicable thresholds are governed by the current commission policy. No commission is earned merely for recruiting another agent. Reversed, refunded, fraudulent or unpaid transactions may be excluded or adjusted.</p></section>
        <section><h3 className="font-semibold">4. Customer payments and records</h3><p>Agents must direct customers to approved LaundryPoint payment channels. Agents must not collect or retain customer cash, use personal accounts to receive LaundryPoint payments, alter transaction records or represent an unconfirmed payment as completed. All customer referrals and related activity must be recorded through approved LaundryPoint systems.</p></section>
        <section><h3 className="font-semibold">5. Conduct and customer care</h3><p>Agents must act honestly, communicate respectfully, avoid misleading claims, protect LaundryPoint property and promptly report complaints, suspected fraud, service issues or conflicts of interest. Agents must not discriminate, harass, threaten or improperly pressure customers, staff or other agents.</p></section>
        <section><h3 className="font-semibold">6. Confidentiality and personal data</h3><p>Customer, staff, pricing, operational and business information accessed through the role is confidential and may be used only to perform authorised duties. Agents must not copy, sell, disclose or retain personal data outside approved systems. Any suspected loss, unauthorised access or disclosure must be reported promptly. These obligations continue after the role ends.</p></section>
        <section><h3 className="font-semibold">7. Equipment, access and security</h3><p>Account credentials are personal and must not be shared. Agents must follow security instructions, use only approved applications and return or cease using LaundryPoint materials and access when requested or when the appointment ends.</p></section>
        <section><h3 className="font-semibold">8. Status and expenses</h3><p>Unless a separate written employment agreement states otherwise, this commission arrangement does not promise a salary, minimum income, fixed working hours or reimbursement of expenses. The agent is responsible for ordinary costs incurred in carrying out the role unless LaundryPoint approves reimbursement in writing.</p></section>
        <section><h3 className="font-semibold">9. Suspension and termination</h3><p>LaundryPoint may suspend access while investigating suspected misconduct, inaccurate information, security concerns or policy breaches. Either party may end the arrangement by written notice. LaundryPoint may end it immediately for fraud, serious misconduct, misuse of customer data, unauthorised collection of payments or material breach. Earned and properly verified commissions remain subject to reconciliation under the applicable policy and law.</p></section>
        <section><h3 className="font-semibold">10. Changes, complaints and governing law</h3><p>Operational procedures and commission schedules may be updated with notice through official channels. Questions or disputes should first be raised with LaundryPoint management for review. This draft is intended to operate subject to the laws of the Federal Republic of Nigeria; any final dispute-resolution and governing-law wording must be confirmed in the approved agreement.</p></section>
        <section><h3 className="font-semibold">11. Declaration</h3><p>By accepting, the applicant confirms that the information supplied is accurate, that they have read and understood these interim terms, and that they agree to follow LaundryPoint's applicable policies while their application is considered. Acceptance does not itself guarantee approval, activation, customer referrals, commission earnings or employment.</p></section>
      </div>
      {accepted ? <p role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Accepted and recorded for this agreement version.</p> : <>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-1" /><span>I have read and agree to the interim LaundryPoint Commission Agent Terms above.</span></label>
        <button type="button" className="btn-primary" disabled={!checked || busy} onClick={() => void accept()}>{busy ? "Recording acceptance…" : "Accept agreement"}</button>
      </>}
      {message && !accepted && <p role="alert" className="text-sm text-red-700">{message}</p>}
    </section>
  );
}
