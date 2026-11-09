"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";
import type { Role } from "@/lib/roles";

type R = { ok: boolean; message: string };
const STAFF: Role[] = ["super_admin", "admin", "secretary", "cashier", "delivery_agent", "commission_agent", "washer"];

export async function raiseSavingsRate(pct: number): Promise<R> {
  const { supabase } = await requireRole(STAFF);
  const { error } = await supabase.rpc("set_my_savings_rate", { _pct: pct });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/savings");
  return { ok: true, message: `Done. You now save ${pct}% of your salary every month.` };
}

export async function giveNotice(lastDay: string, reason: string): Promise<R> {
  const { supabase } = await requireRole(STAFF);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) return { ok: false, message: "Choose your last day." };
  const { error } = await supabase.rpc("give_notice", { _last_day: lastDay, _reason: reason });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/savings");
  return { ok: true, message: "Your notice has been recorded and the super admin has been told." };
}
