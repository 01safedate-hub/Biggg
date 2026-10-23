"use server";

import { createClient } from "@/lib/supabase/server";

export async function unsubscribe(formData: FormData): Promise<{ ok: boolean }> {
  const t = String(formData.get("t") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(t)) return { ok: false };
  const supabase = await createClient();
  const { data } = await supabase.rpc("unsubscribe_marketing", { _token: t });
  return { ok: data === true };
}
