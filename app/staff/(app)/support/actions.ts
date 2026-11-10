"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";

async function supportClient() {
  const { supabase } = await requireRole(["super_admin","admin","secretary","cashier","delivery_agent","commission_agent","washer"]);
  const { data, error } = await supabase.rpc("staff_support_allowed");
  if (error || data !== true) throw new Error("Support access denied");
  return supabase;
}
export async function loadSupport(mode: "all"|"ai"|"human"|"resolved" = "all") {
  const db = await supportClient();
  const { data, error } = await db.rpc("staff_support_list", { _mode: mode });
  if (error) throw new Error(error.message);
  return data;
}
export async function loadSupportHistory(conversationId: string) {
  const db = await supportClient();
  const { data, error } = await db.rpc("staff_support_history", { _conversation_id: conversationId });
  if (error) throw new Error(error.message);
  return data;
}
export async function supportTakeover(conversationId: string) {
  const db = await supportClient();
  const { error } = await db.rpc("staff_support_takeover", { _conversation_id: conversationId });
  if (error) throw new Error(error.message);
  revalidatePath("/staff/support");
}
export async function supportReply(conversationId: string, body: string) {
  const db = await supportClient();
  const { error } = await db.rpc("staff_support_reply", { _conversation_id: conversationId, _body: body });
  if (error) throw new Error(error.message);
  revalidatePath("/staff/support");
}
export async function supportResolve(conversationId: string) {
  const db = await supportClient();
  const { error } = await db.rpc("staff_support_resolve", { _conversation_id: conversationId });
  if (error) throw new Error(error.message);
  revalidatePath("/staff/support");
}
export async function supportReturnAI(conversationId: string) {
  const db = await supportClient();
  const { error } = await db.rpc("staff_support_return_ai", { _conversation_id: conversationId });
  if (error) throw new Error(error.message);
  revalidatePath("/staff/support");
}
