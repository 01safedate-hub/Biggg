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
export async function loadSupportHistory(phone: string) {
  const db = await supportClient();
  const { data, error } = await db.rpc("staff_support_history", { _phone: phone });
  if (error) throw new Error(error.message);
  return data;
}
export async function supportTakeover(phone: string) {
  const db = await supportClient();
  const { error } = await db.rpc("staff_support_takeover", { _phone: phone });
  if (error) throw new Error(error.message);
  revalidatePath("/staff/support");
}
export async function supportReply(phone: string, body: string) {
  const db = await supportClient();
  const { error } = await db.rpc("staff_support_reply", { _phone: phone, _body: body });
  if (error) throw new Error(error.message);
  revalidatePath("/staff/support");
}
export async function supportResolve(phone: string) {
  const db = await supportClient();
  const { error } = await db.rpc("staff_support_resolve", { _phone: phone });
  if (error) throw new Error(error.message);
  revalidatePath("/staff/support");
}
export async function supportReturnAI(phone: string) {
  const db = await supportClient();
  const { error } = await db.rpc("staff_support_return_ai", { _phone: phone });
  if (error) throw new Error(error.message);
  revalidatePath("/staff/support");
}
