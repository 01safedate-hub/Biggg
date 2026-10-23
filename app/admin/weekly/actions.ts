"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

type R = { ok: boolean; message: string };

export async function saveWeeklyTarget(units: number | null, payoutKobo: number): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("set_weekly_bonus", { _units: units as unknown as number, _payout_kobo: payoutKobo });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/weekly");
  return { ok: true, message: "Weekly target saved." };
}

export async function logUnits(staffId: string, units: number, note: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin", "admin"]);
  const { error } = await supabase.rpc("log_units", { _staff: staffId, _units: units, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/weekly");
  return { ok: true, message: "Units recorded." };
}

export async function voidUnits(id: string, reason: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin", "admin"]);
  const { error } = await supabase.rpc("void_units", { _id: id, _reason: reason });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/weekly");
  return { ok: true, message: "Entry voided." };
}

export async function closeWeek(weekStart: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.rpc("close_week", { _week_start: weekStart });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/weekly");
  const n = Number(data ?? 0);
  return { ok: true, message: n === 0 ? "Week closed. Nobody reached the target (or it was already closed)." : `${n} payout${n === 1 ? "" : "s"} created.` };
}

export async function markPaid(id: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("mark_payout_paid", { _id: id });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/weekly");
  return { ok: true, message: "Marked as paid." };
}
