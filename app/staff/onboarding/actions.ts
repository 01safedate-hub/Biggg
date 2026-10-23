"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

const ANY = ["super_admin", "admin", "secretary", "cashier", "delivery_agent"] as const;

export async function saveMyProfile(data: Record<string, string>) {
  const { supabase } = await requireRole([...ANY]);
  const { error } = await supabase.rpc("save_my_staff_profile", { _data: data });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/onboarding");
  return { ok: true, message: "Saved." };
}

export async function submitMyOnboarding() {
  const { supabase } = await requireRole([...ANY]);
  const { error } = await supabase.rpc("submit_onboarding");
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff", "layout");
  return { ok: true, message: "Sent. The super admin will review your details." };
}
