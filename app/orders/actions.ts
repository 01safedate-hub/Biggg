"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

type R = { ok: boolean; message: string };

export async function bookPickup(v: { lat: number; lng: number; address: string; notes: string }): Promise<R & { id?: string }> {
  const { supabase } = await requireUser("/request");
  const { data, error } = await supabase.rpc("book_pickup", { _lat: v.lat, _lng: v.lng, _address: v.address, _notes: v.notes });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return { ok: true, message: "Booked.", id: String(data) };
}

export async function cancelOrder(id: string): Promise<R> {
  const { supabase } = await requireUser("/orders");
  const { error } = await supabase.rpc("cancel_my_order", { _order: id });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/orders/${id}`);
  return { ok: true, message: "Cancelled." };
}

export async function enterOrderCode(id: string, step: "arrival" | "delivery", code: string): Promise<R> {
  const { supabase } = await requireUser(`/orders/${id}`);
  if (!/^\d{4}$/.test(code)) return { ok: false, message: "The code is 4 digits." };
  const { data, error } = await supabase.rpc("verify_order_code", { _order: id, _step: step, _code: code });
  if (error) return { ok: false, message: friendlyError(error.message) };
  const r = data as { ok: boolean; attempts_left?: number };
  revalidatePath(`/orders/${id}`);
  return r.ok ? { ok: true, message: "Thank you. Confirmed." } : { ok: false, message: `That code is not right. ${r.attempts_left ?? 0} tries left.` };
}

export async function startPayment(orderId: string, purpose: "pickup_fare" | "items" | "delivery_fare" | "demurrage", provider: "paystack" | "flutterwave"): Promise<R & { url?: string }> {
  const { supabase } = await requireUser(`/orders/${orderId}`);
  const { data, error } = await supabase.functions.invoke("pay-init", { body: { order_id: orderId, purpose, provider } });
  if (error) {
    let code = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") { try { code = (await ctx.json())?.error ?? code; } catch { /* keep */ } }
    return { ok: false, message: friendlyError(String(code)) };
  }
  const url = (data as { url?: string } | null)?.url;
  return url ? { ok: true, message: "Opening payment", url } : { ok: false, message: friendlyError("provider_failed") };
}

export async function applyPromoCode(orderId: string, code: string): Promise<R> {
  const { supabase } = await requireUser(`/orders/${orderId}`);
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(clean)) return { ok: false, message: friendlyError("promo_invalid") };
  const { data, error } = await supabase.rpc("apply_promo", { _order: orderId, _code: clean });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: `${(data as { percent?: number } | null)?.percent ?? ""}% off applied.` };
}

export async function setOffers(on: boolean): Promise<R> {
  const { supabase } = await requireUser("/account");
  const { error } = await supabase.rpc("set_marketing_opt_in", { _on: on });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/account");
  return { ok: true, message: on ? "You will get our offers by email." : "You will not get offers. Order updates still reach you." };
}

export async function rateOrder(id: string, stars: number, comment: string): Promise<R> {
  const { supabase } = await requireUser(`/orders/${id}`);
  const { error } = await supabase.rpc("rate_order", { _order: id, _stars: stars, _comment: comment.trim().slice(0, 500) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/orders/${id}`);
  return { ok: true, message: "Thank you for rating us." };
}
