"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth";
import { Field, FormMessage } from "./AuthShell";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error: err } = await createClient().auth.signInWithPassword({
      email: String(f.get("email") ?? "").trim().toLowerCase(),
      password: String(f.get("password") ?? ""),
    });
    setBusy(false);
    if (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "email_not_confirmed" || err.message.toLowerCase().includes("confirm")) return setError("Please confirm your email first. Check your inbox for the link.");
      if (code === "user_banned" || err.message.toLowerCase().includes("banned")) return setError("This account has been suspended. Please contact us.");
      if (err.status === 429 || code.includes("rate_limit")) return setError("Too many attempts. Please wait a few minutes and try again.");
      return setError("Incorrect email or password.");
    }
    router.replace(safeNext(next));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <Field id="email" label="Email address" type="email" autoComplete="email" required />
      <Field id="password" label="Password" type="password" autoComplete="current-password" required />
      <div className="text-right text-sm"><Link href="/forgot-password" className="text-brand-dark hover:underline">Forgot password?</Link></div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
    </form>
  );
}
