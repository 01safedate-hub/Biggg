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
