"use client";

import { useState } from "react";
import { inputCls, labelCls } from "@/components/admin/ui";
import { LivePhoto } from "./LivePhoto";

export type ProfileData = Record<string, string | null | undefined>;
export type SaveResult = { ok: boolean; message: string };

const BANKS = ["Access Bank", "First Bank", "GTBank", "UBA", "Zenith Bank", "Fidelity Bank", "Union Bank", "Sterling Bank", "Stanbic IBTC", "Wema Bank", "Polaris Bank", "FCMB", "Keystone Bank", "Opay", "Moniepoint", "Kuda", "PalmPay"];
const FIELDS = ["nin", "date_of_birth", "home_address", "referee_name", "referee_phone", "referee_address", "referee_relationship", "next_of_kin_name", "next_of_kin_phone", "bank_name", "bank_account_number", "bank_account_name"] as const;

/** One form for both people: the staff member (onboarding) and the super admin filling it in for them. */
export function ProfileForm({ userId, initial, photoUrl, locked, onSave, onSubmit, submitLabel }: {
  userId: string; initial: ProfileData; photoUrl: string | null; locked?: boolean;
  onSave: (data: Record<string, string>) => Promise<SaveResult>;
  onSubmit?: () => Promise<SaveResult>;
  submitLabel?: string;
}) {
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [msg, setMsg] = useState<SaveResult | null>(null);

  function collect(form: HTMLFormElement) {
    const f = new FormData(form);
    const data: Record<string, string> = {};
    for (const k of FIELDS) data[k] = String(f.get(k) ?? "").trim();
    if (photoPath) data.photo_path = photoPath;
    return data;
  }

  async function save(form: HTMLFormElement, andSubmit: boolean) {
    setMsg(null); setBusy(andSubmit ? "submit" : "save");
    const r = await onSave(collect(form));
    if (r.ok && andSubmit && onSubmit) { const s = await onSubmit(); setBusy(null); return setMsg(s); }
    setBusy(null); setMsg(r);
  }

  const dis = !!locked;
  const t = (id: string, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label htmlFor={id} className={labelCls}>{label}</label>
      <input id={id} name={id} defaultValue={initial[id] ?? ""} disabled={dis} className={inputCls} {...extra} /></div>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(e.currentTarget, false); }} className="space-y-6">
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.message}</p>}

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">1. Identity</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {t("nin", "National Identification Number (NIN)", { inputMode: "numeric", maxLength: 11, pattern: "\\d{11}", placeholder: "11 digits" })}
          {t("date_of_birth", "Date of birth", { type: "date" })}
        </div>
        {t("home_address", "Home address")}
        <div>
          <p className={labelCls}>Live photo</p>
          <p className="mb-2 text-xs text-ink-mute">Face the camera in good light. This photo is private and only the super admin can see it.</p>
          <LivePhoto userId={userId} currentUrl={photoUrl} onUploaded={setPhotoPath} disabled={dis} />
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">2. Referee</h2>
        <p className="text-sm text-ink-soft">Someone who knows you well and is not a relative living with you.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {t("referee_name", "Full name")}
          {t("referee_phone", "Phone number", { type: "tel" })}
          {t("referee_relationship", "How do they know you?")}
        </div>
        {t("referee_address", "Address")}
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">3. Next of kin</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {t("next_of_kin_name", "Full name")}
          {t("next_of_kin_phone", "Phone number", { type: "tel" })}
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">4. Where we pay you</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label htmlFor="bank_name" className={labelCls}>Bank</label>
            <input id="bank_name" name="bank_name" list="banks" defaultValue={initial.bank_name ?? ""} disabled={dis} className={inputCls} />
            <datalist id="banks">{BANKS.map((b) => <option key={b} value={b} />)}</datalist></div>
          {t("bank_account_number", "Account number", { inputMode: "numeric", maxLength: 10, pattern: "\\d{10}", placeholder: "10 digits" })}
          {t("bank_account_name", "Account name")}
        </div>
      </section>

      {!dis && (
        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary" disabled={!!busy}>{busy === "save" ? "Saving" : "Save draft"}</button>
          {onSubmit && (
            <button type="button" className="btn-primary" disabled={!!busy}
              onClick={(e) => void save((e.currentTarget.closest("form") as HTMLFormElement), true)}>{busy === "submit" ? "Sending" : submitLabel ?? "Save and send for review"}</button>
          )}
        </div>
      )}
    </form>
  );
}
