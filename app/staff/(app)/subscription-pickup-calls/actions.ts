"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";

export async function updatePickupFollowup(id: string, status: "confirmed" | "rescheduled" | "skipped", notes: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["confirmed", "rescheduled", "skipped"].includes(status) || notes.length > 500) {
    return { ok: false, error: "Invalid call outcome." };
  }
  const { supabase } = await requireRole(["cashier", "secretary", "admin", "super_admin"]);
  const { error } = await (supabase as any)
    .from("subscription_pickup_followups")
    .update({ call_status: status, call_notes: notes.trim() || null, last_called_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("call_status", ["pending", "rescheduled"]);
  if (error) return { ok: false, error: "Could not save the call outcome. Refresh and try again." };
  revalidatePath("/staff/subscription-pickup-calls");
  return { ok: true };
}
