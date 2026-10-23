"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

type R = { ok: boolean; message: string };

export async function savePricing(patch: Record<string, number | string>): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("save_pricing_settings", { _patch: patch });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/pricing");
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. New bookings use these straight away." };
}

export async function saveZone(id: string, v: { is_live: boolean; radius_m: number | null; centre_lat: number | null; centre_lng: number | null }): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const hasCentre = v.centre_lat != null && v.centre_lng != null;
  const centreOk = !hasCentre || (v.centre_lat! >= -90 && v.centre_lat! <= 90 && v.centre_lng! >= -180 && v.centre_lng! <= 180);
  const radiusOk = v.radius_m == null || (Number.isInteger(v.radius_m) && v.radius_m >= 200 && v.radius_m <= 50000);
  if (!centreOk || !radiusOk || (v.centre_lat == null) !== (v.centre_lng == null)) return { ok: false, message: friendlyError("invalid_zone") };
  if (v.is_live && (!hasCentre || v.radius_m == null)) return { ok: false, message: "To switch a zone on, give it a centre point and a radius first." };
  const { error } = await supabase.from("zones").update({ is_live: v.is_live, radius_m: v.radius_m, centre_lat: v.centre_lat, centre_lng: v.centre_lng }).eq("id", id);
  if (error) return { ok: false, message: "Could not save the zone. Please try again." };
  revalidatePath("/admin/zones");
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function retryEmail(id: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("retry_email", { _id: id });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/emails");
  return { ok: true, message: "Queued again. It goes out within five minutes." };
}

export async function markRefundPaid(id: string, note: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("mark_refund_paid", { _id: id, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/payments");
  return { ok: true, message: "Marked as refunded." };
}
