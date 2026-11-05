"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

type R = { ok: boolean; message: string };

export async function adminSaveProfile(userId: string, data: Record<string, string>): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("admin_save_staff_profile", { _user: userId, _data: data });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/admin/staff/${userId}`);
  return { ok: true, message: "Details saved." };
}

export async function savePay(userId: string, p: { job_title: string; base: number; boosted: number; target: number | null; weekly: boolean; active: boolean }): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("set_staff_pay", {
    _user: userId, _job_title: p.job_title, _base: p.base, _boosted: p.boosted, _monthly_target: p.target as unknown as number, _weekly: p.weekly, _active: p.active,
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/admin/staff/${userId}`);
  return { ok: true, message: "Pay terms saved." };
}

export async function reviewStaff(userId: string, approve: boolean, note: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("verify_staff", { _user: userId, _approve: approve, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/admin/staff/${userId}`);
  revalidatePath("/admin/staff");
  return { ok: true, message: approve ? "Marked as verified." : "Sent back for changes." };
}

export async function recordHubVerification(userId: string, input: {
  outcome: "passed" | "rejected";
  person_present: boolean;
  nin_document_checked: boolean;
  nin_matches_profile: boolean;
  photo_matches_person: boolean;
  referee_checked: boolean;
  notes: string;
}): Promise<R> {
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { error } = await supabase.rpc("record_staff_hub_verification", {
    _user: userId,
    _outcome: input.outcome,
    _person_present: input.person_present,
    _nin_document_checked: input.nin_document_checked,
    _nin_matches_profile: input.nin_matches_profile,
    _photo_matches_person: input.photo_matches_person,
    _referee_checked: input.referee_checked,
    _notes: input.notes,
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/admin/staff/${userId}`);
  revalidatePath("/admin/staff");
  return { ok: true, message: input.outcome === "passed" ? "In-person hub verification recorded. You may now complete profile approval." : "Failed hub verification recorded; profile approval is blocked." };
}


export async function recordAgentOrientation(userId: string, input: {
  bags_and_receiving: boolean;
  arrival_and_delivery_codes: boolean;
  counting_and_stain_photos: boolean;
  no_cash_app_payments: boolean;
  commission_rules: boolean;
}): Promise<R> {
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { error } = await supabase.rpc("record_agent_orientation", {
    _user: userId,
    _bags_and_receiving: input.bags_and_receiving,
    _arrival_and_delivery_codes: input.arrival_and_delivery_codes,
    _counting_and_stain_photos: input.counting_and_stain_photos,
    _no_cash_app_payments: input.no_cash_app_payments,
    _commission_rules: input.commission_rules,
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/staff/agent-verification/${userId}`);
  return { ok: true, message: "Orientation checklist saved. A successful hub verification is enabled only after all five topics are recorded." };
}


export async function saveAgentHubFacePhoto(userId: string, photoPath: string): Promise<R> {
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { error } = await supabase.rpc("record_agent_hub_face_photo", { _user: userId, _photo_path: photoPath });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/staff/agent-verification/${userId}`);
  return { ok: true, message: "Fresh hub face photo saved." };
}
