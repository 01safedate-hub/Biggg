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
    // Explicit return destinations (e.g. payment/auth callbacks) take precedence.
    if (destination !== "/account") {
      router.replace(destination);
      router.refresh();
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    const [{ data: roleRows, error: rolesError }, { count: addressCount, error: addressError }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      supabase.from("addresses").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);
    const roles = (roleRows ?? []).map((r) => r.role);
    const isSuperAdmin = roles.includes("super_admin");
    const isStaff = roles.some((role) => ["super_admin", "admin", "secretary", "cashier", "delivery_agent"].includes(role));

    if (!rolesError && isStaff) {
      if (isSuperAdmin) {
        router.replace("/admin");
      } else {
        const { data: staffState, error: staffStateError } = await supabase.rpc("my_staff_state");
        const state = staffState as { must_change_password?: boolean; onboarding_status?: string } | null;
        if (staffStateError || !state) {
          setError("We couldn't verify your staff onboarding status. Please try again.");
          return;
        }
        if (state.must_change_password) router.replace("/account/security?forced=1");
        else if (state.onboarding_status === "incomplete" || state.onboarding_status === "rejected") router.replace("/staff/onboarding");
        else router.replace("/staff");
      }
      router.refresh();
      return;
    }

    // Fail closed if roles cannot be checked; never guess that a staff account is a customer.
    if (rolesError || addressError) {
      setError("We couldn't verify your account routing. Please try again.");
      return;
    }
    router.replace(addressCount === 0 ? "/onboarding/location" : "/dashboard");
    router.refresh();
    return;
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
