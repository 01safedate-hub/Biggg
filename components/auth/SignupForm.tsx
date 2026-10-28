"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cleanPhone, isPwnedPassword, MIN_PASSWORD, passwordProblem, PWNED_MESSAGE } from "@/lib/auth";
import { Field, FormMessage } from "./AuthShell";

export function SignupForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const fullName = String(f.get("full_name") ?? "").trim();
    const email = String(f.get("email") ?? "").trim().toLowerCase();
    const phone = cleanPhone(String(f.get("phone") ?? ""));
    const password = String(f.get("password") ?? "");
    const whatsappOptIn = f.get("whatsapp_updates") === "on";

    if (fullName.length < 2) return setError("Please enter your full name.");
    if (!phone) return setError("Please enter a valid phone number, for example 08012345678.");
    const problem = passwordProblem(password, email);
    if (problem) return setError(problem);
    if (password !== String(f.get("confirm") ?? "")) return setError("The two passwords do not match.");

    setBusy(true);
    if (await isPwnedPassword(password)) { setBusy(false); return setError(PWNED_MESSAGE); }
    const { data, error: err } = await createClient().auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone, marketing_opt_in: f.get("offers") === "on" ? "true" : "false", whatsapp_opt_in: whatsappOptIn } },
    });
    setBusy(false);
    if (err) return setError(err.message.toLowerCase().includes("rate") ? "Too many attempts. Please wait a few minutes and try again." : err.message);
    // With email confirmation on, Supabase hides whether the address already exists and returns no identities.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return setError("An account with this email may already exist. Try signing in, or reset your password.");
    }
    setSentTo(email);
  }

  if (sentTo) {
    return <FormMessage kind="info">We sent a confirmation link to <strong>{sentTo}</strong>. Open it to activate your account, then sign in.</FormMessage>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <Field id="full_name" label="Full name" autoComplete="name" required />
      <Field id="email" label="Email address" type="email" autoComplete="email" required />
      <Field id="phone" label="Phone number" type="tel" autoComplete="tel" required hint="Agents use this to reach you for pickup and delivery." />
      <Field id="password" label="Password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} hint={`At least ${MIN_PASSWORD} characters.`} />
      <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" required />
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="offers" className="mt-1" /><span className="text-ink-soft">Send me offers and reminders by email. I can unsubscribe at any time. Order updates are sent either way.</span></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="whatsapp_updates" className="mt-1" /><span className="text-ink-soft">Send me order updates on WhatsApp, including pickup, payment and delivery messages. I can reply STOP to opt out.</span></label>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Creating account" : "Create account"}</button>
    </form>
  );
}
