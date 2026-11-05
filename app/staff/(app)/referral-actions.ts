"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

export async function createAgentReferral(input: { full_name: string; email: string; phone: string }) {
  const { supabase } = await requireRole(["delivery_agent", "commission_agent"]);
  const { data: applicationId, error } = await supabase.rpc("create_agent_referral", {
    _full_name: input.full_name.trim(),
    _email: input.email.trim().toLowerCase(),
    _phone: input.phone.trim(),
  });
  if (error || !applicationId) return { ok: false, message: friendlyError(error?.message ?? "referral_create_failed") };

  const { data, error: inviteError } = await supabase.functions.invoke("agent-referral-invite", {
    body: { application_id: applicationId },
  });
  revalidatePath("/staff/referrals");
  if (inviteError || !data?.ok) {
    return { ok: true, message: "Referral saved, but the invitation email was not sent. Refresh the list and use Send invitation to retry." };
  }
  return { ok: true, message: "Invitation sent. The applicant must complete their details, attend hub/NIN verification with a secretary, and receive super-admin approval before activation." };
}

export async function resendAgentReferralInvite(applicationId: string) {
  const { supabase } = await requireRole(["delivery_agent", "commission_agent"]);
  const { data, error } = await supabase.functions.invoke("agent-referral-invite", { body: { application_id: applicationId } });
  if (error || !data?.ok) return { ok: false, message: error?.message ?? data?.error ?? "Invitation could not be sent." };
  revalidatePath("/staff/referrals");
  return { ok: true, message: "Application invitation sent." };
}
