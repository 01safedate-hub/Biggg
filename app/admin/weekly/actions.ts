"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

type R = { ok: boolean; message: string };

/** Set or change the team target for this week or next week. The database only allows the owner account. */
export async function setTeamTarget(weekStart: string, units: number, poolKobo: number): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.rpc("set_team_weekly_target", { _week_start: weekStart, _units: units, _pool_kobo: poolKobo });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/weekly");
  const n = Number((data as { members?: number } | null)?.members ?? 0);
  return { ok: true, message: `Target saved. ${n} ${n === 1 ? "person has" : "people have"} been emailed.` };
}

export async function markPaid(id: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("mark_payout_paid", { _id: id });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/weekly");
  return { ok: true, message: "Marked as paid." };
}
