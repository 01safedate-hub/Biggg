"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

type R = { ok: boolean; message: string };
const DESK = ["secretary", "admin", "super_admin"] as const;

export async function assignAgent(orderId: string, agentId: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("assign_pickup_agent", { _order: orderId, _agent: agentId });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/dispatch");
  return { ok: true, message: "Agent assigned. The customer has been told." };
}

export async function showArrivalCode(orderId: string): Promise<R & { code?: string }> {
  const { supabase } = await requireRole(["delivery_agent"]);
  const { data, error } = await supabase.rpc("issue_order_code", { _order: orderId, _step: "arrival" });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return { ok: true, message: "", code: String(data) };
}

export async function sendBill(orderId: string, lines: { item: string; qty: number }[]): Promise<R> {
  const { supabase } = await requireRole(["delivery_agent"]);
  for (const l of lines) {
    const { error } = await supabase.rpc("agent_set_item", { _order: orderId, _item: l.item, _qty: l.qty });
    if (error) return { ok: false, message: friendlyError(error.message) };
  }
  const { error } = await supabase.rpc("agent_submit_count", { _order: orderId });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/staff/jobs/${orderId}`);
  return { ok: true, message: "Bill sent to the customer's phone." };
}

export async function reopenBill(orderId: string): Promise<R> {
  const { supabase } = await requireRole(["delivery_agent"]);
  const { error } = await supabase.rpc("agent_reopen_count", { _order: orderId });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/staff/jobs/${orderId}`);
  return { ok: true, message: "Bill withdrawn. You can correct the list." };
}

export async function checkLine(orderId: string, lineId: string, ok: boolean, note: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("check_order_item", { _item: lineId, _ok: ok, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/staff/receiving/${orderId}`);
  return { ok: true, message: "Saved." };
}

export async function receiveOrder(orderId: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("mark_received", { _order: orderId });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/receiving");
  return { ok: true, message: "Received." };
}
