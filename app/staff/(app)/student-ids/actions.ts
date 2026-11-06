"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

type R = { ok: boolean; message: string };

export async function reviewStudentId(id: string, approve: boolean, reason: string): Promise<R> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Invalid request." };
  if (!approve && reason.trim().length < 3) return { ok: false, message: "Tell the student why the ID was not accepted." };
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { data, error } = await supabase.rpc("review_student_verification", { _id: id, _approve: approve, _reason: reason.trim().slice(0, 300) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/student-ids");
  const r = data as { plans_started?: number; refund_kobo?: number } | null;
  return { ok: true, message: approve
    ? (r?.plans_started ? "Approved. The plan has started and the student has been emailed." : "Approved.")
    : (Number(r?.refund_kobo ?? 0) > 0 ? "Rejected. The plan is cancelled and a refund is listed below for payment." : "Rejected. The student has been emailed.") };
}
