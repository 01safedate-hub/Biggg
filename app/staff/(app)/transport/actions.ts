"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

type R = { ok: boolean; message: string };
const UUID = /^[0-9a-f-]{36}$/i;

export async function waiveOrderTransport(orderId: string, reason: string): Promise<R> {
  const { supabase } = await requireRole(["admin", "super_admin", "cashier"]);
  if (!UUID.test(orderId)) return { ok: false, message: "Order not found." };
  const { error } = await supabase.rpc("waive_order_transport" as never, { _order: orderId, _reason: reason.trim() } as never);
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/staff/orders/${orderId}`);
  return { ok: true, message: "Transport is now free on this order." };
}

export async function createTransportRule(input: { label: string; service: string; scope: string; target: string | null; legs: string; startsAt: string | null; endsAt: string | null; message: string }): Promise<R> {
  const { supabase } = await requireRole(["admin", "super_admin"]);
  if (input.scope !== "all" && !(input.target && UUID.test(input.target))) return { ok: false, message: "Choose who the rule is for." };
  const { error } = await supabase.rpc("create_transport_waiver" as never, {
    _label: input.label.trim(), _service: input.service, _scope: input.scope, _target: input.scope === "all" ? null : input.target,
    _legs: input.legs, _starts_at: input.startsAt || null, _ends_at: input.endsAt || null, _message: input.message.trim() || null,
  } as never);
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/transport");
  revalidatePath("/", "layout");
  return { ok: true, message: "Rule saved. It applies to new bookings from its start time." };
}

export async function endTransportRule(id: string): Promise<R> {
  const { supabase } = await requireRole(["admin", "super_admin"]);
  if (!UUID.test(id)) return { ok: false, message: "Rule not found." };
  const { error } = await supabase.rpc("end_transport_waiver" as never, { _id: id } as never);
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/transport");
  revalidatePath("/", "layout");
  return { ok: true, message: "Rule ended. Fares apply again to new bookings. Orders already booked keep their price." };
}

export async function searchCustomers(q: string): Promise<{ id: string; label: string }[]> {
  const { supabase } = await requireRole(["admin", "super_admin"]);
  const safe = q.trim().replace(/[%,()_\\]/g, " ").trim().slice(0, 60);
  if (safe.length < 3) return [];
  const { data } = await supabase.from("profiles").select("id,full_name,phone,email").or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`).eq("status", "active").limit(8);
  return (data ?? []).map((p) => ({ id: p.id, label: [p.full_name, p.phone, p.email].filter(Boolean).join(" · ") }));
}
