"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isPwnedPassword, MIN_PASSWORD, passwordProblem, PWNED_MESSAGE } from "@/lib/auth";
import { Field, FormMessage } from "./AuthShell";

/** Used after a reset link (mode "reset") and after accepting a staff invitation (mode "welcome"). */
export function ResetForm({ mode = "reset" }: { mode?: "reset" | "welcome" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setError("This page has expired. Please use the link in your email again.");
    const problem = passwordProblem(password, user.email);
    if (problem) return setError(problem);
    if (password !== String(f.get("confirm") ?? "")) return setError("The two passwords do not match.");
    setBusy(true);
    if (await isPwnedPassword(password)) { setBusy(false); return setError(PWNED_MESSAGE); }
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setBusy(false);
      return setError(err.message.toLowerCase().includes("different") ? "Choose a password you have not used before." : err.message);
    }
    await supabase.auth.signOut({ scope: "others" }); // anyone else signed in with the old password is signed out
    setBusy(false);
    router.replace(mode === "welcome" ? "/staff" : "/account?notice=password_changed");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <Field id="password" label={mode === "welcome" ? "Choose your password" : "New password"} type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} hint={`At least ${MIN_PASSWORD} characters. A short phrase of several words works well.`} />
      <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" required />
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving" : mode === "welcome" ? "Save password and continue" : "Save new password"}</button>
    </form>
  );
}
