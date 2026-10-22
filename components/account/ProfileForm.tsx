"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/rpc-errors";
import { Field, FormMessage } from "@/components/auth/AuthShell";

export function ProfileForm({ name, phone }: { name: string; phone: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await createClient().rpc("update_my_profile", { _full_name: String(f.get("full_name") ?? ""), _phone: String(f.get("phone") ?? "") });
    setBusy(false);
    if (error) return setMsg({ kind: "error", text: friendlyError(error.message) });
    setMsg({ kind: "info", text: "Your details were saved." });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {msg && <FormMessage kind={msg.kind}>{msg.text}</FormMessage>}
      <Field id="full_name" label="Full name" defaultValue={name} autoComplete="name" required />
      <Field id="phone" label="Phone number" type="tel" defaultValue={phone} autoComplete="tel" required />
      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Save details"}</button>
    </form>
  );
}
