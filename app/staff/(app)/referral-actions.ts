"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

export async function createAgentReferral(input: { full_name: string; email: string; phone: string }) {
  const { supabase } = await requireRole(["delivery_agent", "commission_agent"]);
  const { error } = await supabase.rpc("create_agent_referral", {
    _full_name: input.full_name.trim(),
    _email: input.email.trim().toLowerCase(),
    _phone: input.phone.trim(),
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/referrals");
  return { ok: true, message: "Agent referral recorded. They must complete the application, hub verification and final approval before receiving access." };
}
