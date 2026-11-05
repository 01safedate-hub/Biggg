"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordAgentOrientation } from "@/app/admin/staff/[id]/actions";

type Orientation = {
  bags_and_receiving_at?: string | null;
  arrival_and_delivery_codes_at?: string | null;
  counting_and_stain_photos_at?: string | null;
  no_cash_app_payments_at?: string | null;
  commission_rules_at?: string | null;
};

const ITEMS = [
  ["bags_and_receiving", "Where bags are dropped and how receiving works", "bags_and_receiving_at"],
  ["arrival_and_delivery_codes", "Arrival and delivery codes", "arrival_and_delivery_codes_at"],
  ["counting_and_stain_photos", "Counting items and photographing hard stains", "counting_and_stain_photos_at"],
  ["no_cash_app_payments", "Never take cash; customers pay in the app", "no_cash_app_payments_at"],
  ["commission_rules", "Commission rules", "commission_rules_at"],
] as const;

export function AgentOrientationChecklist({ userId, record }: { userId: string; record: Orientation | null }) {
  const router = useRouter();
  const [checks, setChecks] = useState({
    bags_and_receiving: Boolean(record?.bags_and_receiving_at),
    arrival_and_delivery_codes: Boolean(record?.arrival_and_delivery_codes_at),
    counting_and_stain_photos: Boolean(record?.counting_and_stain_photos_at),
    no_cash_app_payments: Boolean(record?.no_cash_app_payments_at),
    commission_rules: Boolean(record?.commission_rules_at),
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const done = Object.values(checks).every(Boolean);

  async function save() {
    setBusy(true);
    setMessage(null);
    const result = await recordAgentOrientation(userId, checks);
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) router.refresh();
  }

  return (
    <section className="card space-y-3 p-5">
      <h2 className="text-lg font-semibold">Commission-agent orientation</h2>
      <p className="text-sm text-ink-soft">Tick each topic only after explaining it to the applicant. Each saved item is timestamped. All five are required before a successful hub verification can be recorded.</p>
      <div className="space-y-3">
        {ITEMS.map(([key, label, timestamp]) => (
          <label key={key} className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={checks[key]} onChange={e => setChecks(old => ({ ...old, [key]: e.target.checked }))} />
            <span className="flex-1">{label}{record?.[timestamp] && <span className="mt-1 block text-xs text-ink-mute">Recorded {new Date(record[timestamp]!).toLocaleString()}</span>}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save orientation checklist"}</button>
        <span className="text-xs text-ink-mute">{done ? "All orientation topics checked" : "Orientation incomplete"}</span>
      </div>
      {message && <p role={message.ok ? "status" : "alert"} className="text-sm text-ink-soft">{message.text}</p>}
    </section>
  );
}
