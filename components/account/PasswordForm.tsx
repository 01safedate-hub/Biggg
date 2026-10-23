"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isPwnedPassword, passwordProblem, PWNED_MESSAGE } from "@/lib/auth";
import { Field, FormMessage } from "@/components/auth/AuthShell";

/** Changing a password needs the current one, so a borrowed or left-open session cannot take over the account. */
export function PasswordForm({ email, forced }: { email: string; forced?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const form = e.currentTarget;
    const f = new FormData(form);
    const current = String(f.get("current") ?? "");
    const next = String(f.get("password") ?? "");
    if (next === current) return setMsg({ kind: "error", text: "Your new password must be different from the current one." });
    const problem = passwordProblem(next, email);
    if (problem) return setMsg({ kind: "error", text: problem });
    if (next !== String(f.get("confirm") ?? "")) return setMsg({ kind: "error", text: "The two new passwords do not match." });

    setBusy(true);
    const supabase = createClient();
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) { setBusy(false); return setMsg({ kind: "error", text: "Your current password is not correct." }); }
    if (await isPwnedPassword(next)) { setBusy(false); return setMsg({ kind: "error", text: PWNED_MESSAGE }); }
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) { setBusy(false); return setMsg({ kind: "error", text: error.message }); }
    await supabase.auth.signOut({ scope: "others" });
    if (forced) {
      const ack = await supabase.rpc("acknowledge_password_changed");
      if (ack.error) { setBusy(false); return setMsg({ kind: "error", text: "Your password changed, but we could not finish. Please sign in again." }); }
      window.location.assign("/staff");
      return;
    }
    setBusy(false);
    form.reset();
    setMsg({ kind: "info", text: "Your password was changed. Other devices were signed out." });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {msg && <FormMessage kind={msg.kind}>{msg.text}</FormMessage>}
      <Field id="current" label="Current password" type="password" autoComplete="current-password" required />
      <Field id="password" label="New password" type="password" autoComplete="new-password" required />
      <Field id="confirm" label="Confirm new password" type="password" autoComplete="new-password" required />
      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Change password"}</button>
    </form>
  );
}
