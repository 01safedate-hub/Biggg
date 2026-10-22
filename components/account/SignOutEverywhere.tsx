"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutEverywhere() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    await createClient().auth.signOut({ scope: "global" });
    router.replace("/login");
    router.refresh();
  }
  return <button className="btn-secondary" onClick={run} disabled={busy}>{busy ? "Signing out" : "Sign out on all devices"}</button>;
}
