"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MIN_PASSWORD } from "@/lib/auth";
import { Field, FormMessage } from "./AuthShell";

export function ResetForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    if (password.length < MIN_PASSWORD) return setError(`Your password must be at least ${MIN_PASSWORD} characters.`);
    if (password !== String(f.get("confirm") ?? "")) return setError("The two passwords do not match.");
    setBusy(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(err.message);
    router.replace("/account");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <Field id="password" label="New password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} />
      <Field id="confirm" label="Confirm new password" type="password" autoComplete="new-password" required />
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving" : "Save new password"}</button>
    </form>
  );
}
