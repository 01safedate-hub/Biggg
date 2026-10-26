"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

type R = { ok: boolean; message: string };

export async function sendTestEmail(): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("send_test_email");
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/emails");
  return { ok: true, message: "Queued. It goes out within five minutes. Check your inbox and spam, then refresh this page: it should show as sent." };
}

export async function extendInstant(orderId: string, minutes: number, note: string): Promise<R> {
  const { supabase } = await requireRole(["admin", "super_admin"]);
  const { error } = await supabase.rpc("extend_instant", { _order: orderId, _minutes: minutes, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/instant");
  return { ok: true, message: "Time extended. The customer has been told." };
}

export async function setClientOwner(clientId: string, ownerId: string | null): Promise<R> {
  const { supabase } = await requireRole(["super_admin", "admin"]);
  const { error } = await supabase.rpc("set_client_owner", { _client: clientId, _owner: (ownerId || null) as string });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/admin/customers/${clientId}`);
  return { ok: true, message: "Saved." };
}
