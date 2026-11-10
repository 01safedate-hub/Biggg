"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

export async function confirmBatch(customId: string, order: string): Promise<{ ok: boolean; message: string }> {
  const { supabase } = await requireUser(`/my-customs/${customId}`);
  const { data, error } = await supabase.rpc("confirm_custom_batch", { _order: order });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/my-customs/${customId}`);
  revalidatePath("/my-customs");
  const r = data as { status: string; members_left?: number };
  if (r.status === "waiting_members") return { ok: true, message: `Thanks, your items are confirmed. Waiting for ${r.members_left} more member${r.members_left === 1 ? "" : "s"} (or the manager).` };
  if (r.status === "waiting_balance") return { ok: true, message: "Everyone has confirmed. Washing starts as soon as the balance is topped up." };
  return { ok: true, message: "Confirmed. Your clothes are going into the wash." };
}
