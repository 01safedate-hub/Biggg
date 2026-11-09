"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";
import { naira } from "@/lib/format";

export async function requestWithdrawal(): Promise<{ ok: boolean; message: string }> {
  const { supabase } = await requireRole(["commission_agent", "delivery_agent"]);
  const { data, error } = await supabase.rpc("request_commission_withdrawal");
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/commissions");
  const d = data as { net_kobo?: number } | null;
  return { ok: true, message: `Withdrawal requested. You will receive ${naira(Number(d?.net_kobo ?? 0))} once it is approved and paid.` };
}
