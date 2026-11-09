"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";
import { naira } from "@/lib/format";

type R = { ok: boolean; message: string };

export async function confirmSalaries(month: string, lines: { staff_id: string; salary_kobo: number }[]): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { ok: false, message: "Choose a month." };
  const { data, error } = await supabase.rpc("confirm_salaries", { _month: month, _lines: lines as never });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/savings");
  const d = data as { people?: number; total_saved_kobo?: number } | null;
  return { ok: true, message: `Confirmed for ${d?.people ?? lines.length} people. ${naira(Number(d?.total_saved_kobo ?? 0))} saved.` };
}

export async function payOutSavings(staffId: string, reference: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.rpc("pay_out_savings", { _staff: staffId, _reference: reference });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/savings");
  return { ok: true, message: `Paid out ${naira(Number(data ?? 0))}.` };
}

export async function recordDismissal(staffId: string, reason: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("record_dismissal", { _staff: staffId, _reason: reason });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/savings");
  return { ok: true, message: "Dismissal recorded. Their savings are now due." };
}

export async function cancelExit(staffId: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("cancel_staff_exit", { _staff: staffId });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/savings");
  return { ok: true, message: "Notice withdrawn." };
}
