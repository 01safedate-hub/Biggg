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

export async function saveZone(id: string, v: { is_live: boolean; radius_m: number | null; centre_lat: number | null; centre_lng: number | null; auto_live: boolean }): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const hasCentre = v.centre_lat != null && v.centre_lng != null;
  const centreOk = !hasCentre || (v.centre_lat! >= -90 && v.centre_lat! <= 90 && v.centre_lng! >= -180 && v.centre_lng! <= 180);
  const radiusOk = v.radius_m == null || (Number.isInteger(v.radius_m) && v.radius_m >= 200 && v.radius_m <= 50000);
  if (!centreOk || !radiusOk || (v.centre_lat == null) !== (v.centre_lng == null)) return { ok: false, message: friendlyError("invalid_zone") };
  if (v.is_live && !v.auto_live && (!hasCentre || v.radius_m == null)) return { ok: false, message: "To switch a zone on, give it a centre point and a radius first." };
  const { error } = await supabase.from("zones").update({ is_live: v.is_live, radius_m: v.radius_m, centre_lat: v.centre_lat, centre_lng: v.centre_lng, auto_live: v.auto_live, coords_approx: false }).eq("id", id);
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

export async function waiveStorageFee(orderId: string, reason: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("waive_demurrage", { _order: orderId, _reason: reason });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/attention");
  return { ok: true, message: "Storage fee waived." };
}

export async function resolveReview(eventId: number, action: "refund" | "keep", note: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("resolve_payment_review", { _event: eventId, _action: action, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/attention");
  return { ok: true, message: action === "refund" ? "Refund queued under Payments." : "Marked as handled." };
}

export async function resolveIssueAction(id: string, status: "resolved" | "rejected", resolution: string, compensationNaira: number): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const kobo = Math.round((Number.isFinite(compensationNaira) ? compensationNaira : 0) * 100);
  const { error } = await supabase.rpc("resolve_issue", { _id: id, _status: status, _resolution: resolution, _compensation_kobo: kobo });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/attention");
  return { ok: true, message: "Saved. The customer has been told." };
}

export async function saveDispatchRules(v: { auto: boolean; maxJobs: number; reassignMin: number; needCheckin: boolean }): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("save_dispatch_settings", { _auto: v.auto, _max_jobs: Math.round(v.maxJobs), _reassign_min: Math.round(v.reassignMin), _need_checkin: v.needCheckin });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/agents");
  return { ok: true, message: "Saved." };
}

export async function saveSlotRules(v: { enabled: boolean; window: number; days: number; lead: number; capacity: number }): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("save_slot_settings", { _enabled: v.enabled, _window: Math.round(v.window), _days: Math.round(v.days), _lead: Math.round(v.lead), _capacity: Math.round(v.capacity) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/agents");
  return { ok: true, message: "Saved." };
}

// ---------- bank disputes (chargebacks) ----------
export async function openDisputeAction(orderNo: number, purpose: string, reason: string, due: string): Promise<R & { id?: string }> {
  const { supabase } = await requireRole(["super_admin"]);
  if (!Number.isInteger(orderNo) || orderNo < 1) return { ok: false, message: "Enter the order number." };
  if (!["items", "pickup_fare", "delivery_fare", "demurrage"].includes(purpose)) return { ok: false, message: "Choose which payment was queried." };
  const { data: o } = await supabase.from("orders").select("id").eq("order_no", orderNo).maybeSingle();
  if (!o) return { ok: false, message: "That order could not be found." };
  const { data: p } = await supabase.from("payments").select("id").eq("order_id", o.id).eq("purpose", purpose as "items").eq("kind", "payment").eq("status", "success").in("mode", ["paystack", "flutterwave"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!p) return { ok: false, message: "No successful online payment of that kind was found on this order." };
  const { data, error } = await supabase.rpc("open_dispute", { _payment: p.id, _reason: reason.trim(), _due: (/^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null) as string });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/disputes");
  return { ok: true, message: "Dispute recorded. The clothes are on hold.", id: String(data) };
}

export async function markEvidenceSent(id: string, note: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("mark_dispute_evidence_sent", { _id: id, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/admin/disputes/${id}`);
  return { ok: true, message: "Saved." };
}

export async function resolveDisputeAction(id: string, outcome: "won" | "lost", note: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("resolve_dispute", { _id: id, _outcome: outcome, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/admin/disputes/${id}`);
  revalidatePath("/admin/disputes");
  return { ok: true, message: outcome === "won" ? "Marked as won. The order is released." : "Marked as lost. The refund is in the books." };
}

export async function saveInstantRules(v: { enabled: boolean; feeNaira: number; targetHours: number; largeItems: number; largeHours: number; pickupMinutes: number }): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("save_instant_settings", { _enabled: v.enabled, _fee_kobo: Math.round(v.feeNaira * 100), _target_hours: Math.round(v.targetHours), _large_items: Math.round(v.largeItems), _large_hours: Math.round(v.largeHours), _pickup_target: Math.round(v.pickupMinutes) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/speed");
  return { ok: true, message: "Saved." };
}

export async function refundInstantFee(orderId: string, note: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("refund_instant_fee", { _order: orderId, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/speed");
  return { ok: true, message: "Refund queued. Pay it from Online payments, then mark it paid." };
}

export async function saveServiceArea(v: { name: string; lat: number; lng: number; multiplier: number }): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const name = v.name.trim().slice(0, 60);
  if (!name || !Number.isFinite(v.lat) || !Number.isFinite(v.lng) || Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) return { ok: false, message: friendlyError("invalid_zone") };
  if (!Number.isFinite(v.multiplier) || v.multiplier < 0.5 || v.multiplier > 5) return { ok: false, message: "The multiplier must be between 0.5 and 5." };
  const { data: cur } = await supabase.from("settings").select("value").eq("key", "service_area").maybeSingle();
  const value = { ...((cur?.value as Record<string, unknown>) ?? {}), reference_name: name, reference_lat: v.lat, reference_lng: v.lng, multiplier: v.multiplier };
  const { error } = await supabase.from("settings").update({ value }).eq("key", "service_area");
  if (error) return { ok: false, message: "Could not save. Please try again." };
  revalidatePath("/admin/zones");
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. Places inside the new depth are switched on automatically." };
}
