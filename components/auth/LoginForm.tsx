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
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
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
    const destination = safeNext(next);
    // Send first-time customers to the pickup-request experience from the default account landing.
    // Preserve explicit return destinations and never send staff into customer onboarding.
    if (destination === "/account") {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const [{ count: addressCount, error: addressError }, { data: roles, error: rolesError }] = await Promise.all([
          supabase.from("addresses").select("id", { count: "exact", head: true }).eq("user_id", user.id),
          supabase.from("user_roles").select("role").eq("user_id", user.id),
        ]);
        const isStaff = (roles ?? []).some((r) => ["super_admin", "admin", "secretary", "cashier", "delivery_agent"].includes(r.role));
        if (!rolesError && !isStaff && !addressError && addressCount === 0) {
          router.replace("/request");
          router.refresh();
          return;
        }
      }
    }
    router.replace(destination);
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
