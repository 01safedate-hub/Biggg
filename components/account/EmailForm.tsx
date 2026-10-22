"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Field, FormMessage } from "@/components/auth/AuthShell";

export function EmailForm({ email, pendingEmail }: { email: string; pendingEmail: string | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(
    pendingEmail ? { kind: "info", text: `A change to ${pendingEmail} is waiting for confirmation. Open the links we emailed to both addresses.` } : null,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const form = e.currentTarget;
    const f = new FormData(form);
    const next = String(f.get("email") ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(next)) return setMsg({ kind: "error", text: "Enter a valid email address." });
    if (next === email.toLowerCase()) return setMsg({ kind: "error", text: "That is already your email address." });

    setBusy(true);
    const supabase = createClient();
    const check = await supabase.auth.signInWithPassword({ email, password: String(f.get("current") ?? "") });
    if (check.error) { setBusy(false); return setMsg({ kind: "error", text: "Your current password is not correct." }); }
    const { error } = await supabase.auth.updateUser({ email: next });
    setBusy(false);
    if (error) {
      const taken = error.message.toLowerCase().includes("already") || (error as { code?: string }).code === "email_exists";
      return setMsg({ kind: "error", text: taken ? "That email address cannot be used." : error.message });
    }
    form.reset();
    setMsg({ kind: "info", text: `We sent a link to ${next} and another to ${email}. Open both to finish the change. Until then you keep signing in with ${email}.` });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {msg && <FormMessage kind={msg.kind}>{msg.text}</FormMessage>}
      <p className="text-sm text-ink-soft">Your sign-in email is <strong>{email}</strong>.</p>
      <Field id="email" label="New email address" type="email" autoComplete="email" required />
      <Field id="current" label="Current password" type="password" autoComplete="current-password" required />
      <button className="btn-primary" disabled={busy}>{busy ? "Sending" : "Change email"}</button>
    </form>
  );
}
