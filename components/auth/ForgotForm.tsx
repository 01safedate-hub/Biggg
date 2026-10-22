"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Field, FormMessage } from "./AuthShell";

export function ForgotForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim().toLowerCase();
    setBusy(true);
    await createClient().auth.resetPasswordForEmail(email);
    setBusy(false);
    setDone(true); // same message whether or not the address exists
  }

  if (done) return <FormMessage kind="info">If an account exists for that email, a reset link is on its way.</FormMessage>;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field id="email" label="Email address" type="email" autoComplete="email" required />
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending" : "Send reset link"}</button>
    </form>
  );
}
