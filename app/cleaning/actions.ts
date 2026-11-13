"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/roles";
import { friendlyError as baseError } from "@/lib/rpc-errors";

type R = { ok: boolean; message: string };
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WINDOWS = ["morning", "afternoon"];

// Cleaning wording for codes whose shared message talks about laundry pickups.
function friendlyError(message: string | undefined): string {
  const m = String(message ?? "");
  if (m.includes("not_served")) return "We do not cover this area for cleaning yet. Call or WhatsApp 0913 258 4627.";
  if (m.includes("slot_unavailable")) return "That day is fully booked. Please choose another day.";
  return baseError(m);
}

// These RPCs were added with the cleaning migrations; generated Supabase types are stale until regenerated.
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
async function db(next: string) {
  const { supabase, user } = await requireUser(next);
  const rpc = ((fn: string, args?: Record<string, unknown>) => supabase.rpc(fn as never, args as never)) as unknown as Rpc;
  return { supabase, user, rpc };
}

export type RequestInput = {
  service: string; wants_plan: boolean; lat?: number | null; lng?: number | null; address?: string; property_id?: string | null;
  home_kind: string; bedrooms: number | null; bathrooms: number | null; details: string; preferred: string; photos: string[];
};

export async function createCleaningRequest(v: RequestInput): Promise<R & { id?: string; requestNo?: number }> {
  const { rpc, user } = await db("/cleaning/request");
  const photos = (v.photos ?? []).filter((p) => typeof p === "string" && p.startsWith(`requests/${user.id}/`)).slice(0, 10);
  const { data, error } = await rpc("cleaning_request_create", {
    _p: {
      service: v.service, wants_plan: v.wants_plan === true, property_id: v.property_id && UUID.test(v.property_id) ? v.property_id : null,
      lat: v.property_id ? null : v.lat, lng: v.property_id ? null : v.lng, address: (v.address ?? "").trim(),
      home_kind: v.home_kind, bedrooms: v.bedrooms, bathrooms: v.bathrooms,
      details: v.details.trim().slice(0, 1000), preferred: v.preferred.trim().slice(0, 200), photos,
    },
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  const r = data as { id: string; request_no: number };
  revalidatePath("/cleaning/my");
  return { ok: true, message: "Request sent.", id: r.id, requestNo: r.request_no };
}

export async function cleaningSlots(zoneId: string, crew: number, duration: number): Promise<{ date: string; weekday: number; zone_day: boolean }[]> {
  const { rpc } = await db("/cleaning/my");
  if (!UUID.test(zoneId)) return [];
  const { data, error } = await rpc("cleaning_slots", { _zone: zoneId, _crew: crew, _duration: duration, _from: null, _days: 30 });
  if (error) return [];
  return (data ?? []) as { date: string; weekday: number; zone_day: boolean }[];
}

export async function acceptCleaningQuote(quoteId: string, v: { date: string; window: string; term: string; deposit: boolean }): Promise<R & { invoiceId?: string; paid?: boolean; amountKobo?: number }> {
  const { rpc } = await db(`/cleaning/quote/${quoteId}`);
  if (!UUID.test(quoteId)) return { ok: false, message: "Quote not found." };
  if (!DATE.test(v.date) || !WINDOWS.includes(v.window)) return { ok: false, message: friendlyError("slot_invalid") };
  const { data, error } = await rpc("cleaning_accept_quote", { _quote: quoteId, _p: { date: v.date, window: v.window, term: v.term, deposit: v.deposit === true } });
  if (error) return { ok: false, message: friendlyError(error.message) };
  const r = data as { invoice_id: string; amount_kobo: number; paid: boolean };
  revalidatePath("/cleaning/my");
  revalidatePath(`/cleaning/quote/${quoteId}`);
  return { ok: true, message: r.paid ? "Booked." : "Time held. Complete payment to confirm.", invoiceId: r.invoice_id, paid: r.paid, amountKobo: r.amount_kobo };
}

export async function declineCleaningQuote(quoteId: string, reason: string): Promise<R> {
  const { rpc } = await db(`/cleaning/quote/${quoteId}`);
  if (!UUID.test(quoteId)) return { ok: false, message: "Quote not found." };
  const { error } = await rpc("cleaning_decline_quote", { _quote: quoteId, _reason: reason.trim().slice(0, 300) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/cleaning/my");
  revalidatePath(`/cleaning/quote/${quoteId}`);
  return { ok: true, message: "Quote declined. Thank you for letting us know." };
}

export async function startCleaningPayment(invoiceId: string, provider: "paystack" | "flutterwave"): Promise<R & { url?: string }> {
  const { supabase, rpc } = await db("/cleaning/my");
  if (!UUID.test(invoiceId)) return { ok: false, message: "Bill not found." };
  const { data: points, error: pointsError } = await rpc("active_payment_providers");
  if (pointsError) return { ok: false, message: "We could not check payment availability. Please try again." };
  if (!((points ?? []) as string[]).includes(provider)) return { ok: false, message: `${provider === "paystack" ? "Paystack" : "Flutterwave"} is currently switched off. Please choose another payment method.` };
  const { data, error } = await supabase.functions.invoke("pay-init", { body: { purpose: "cleaning", invoice_id: invoiceId, provider } });
  if (error) {
    let code = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") { try { code = (await ctx.json())?.error ?? code; } catch { /* keep */ } }
    return { ok: false, message: friendlyError(String(code)) };
  }
  const url = (data as { url?: string } | null)?.url;
  return url ? { ok: true, message: "", url } : { ok: false, message: "Could not start payment. Please try again." };
}

export async function verifyCleaningPayment(reference: string): Promise<R & { settled?: number }> {
  const { supabase } = await db("/cleaning/my");
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(reference)) return { ok: false, message: "Payment reference not recognised." };
  const { data, error } = await supabase.functions.invoke("pay-verify", { body: { reference } });
  if (error) return { ok: false, message: "We could not check just now. Please try again in a moment." };
  revalidatePath("/cleaning/my");
  const s = Number((data as { settled?: number } | null)?.settled ?? 0);
  return { ok: true, message: s > 0 ? "Payment confirmed. Thank you." : "Not confirmed yet. If you completed payment, wait a minute and check again.", settled: s };
}

export async function rescheduleCleaningVisit(visitId: string, date: string, window: string): Promise<R> {
  const { rpc } = await db("/cleaning/my");
  if (!UUID.test(visitId) || !DATE.test(date) || !WINDOWS.includes(window)) return { ok: false, message: friendlyError("slot_invalid") };
  const { error } = await rpc("cleaning_reschedule", { _visit: visitId, _date: date, _window: window });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/cleaning/my");
  return { ok: true, message: "Visit moved." };
}

export async function rateCleaningVisit(visitId: string, rating: number, note: string): Promise<R> {
  const { rpc } = await db("/cleaning/my");
  if (!UUID.test(visitId) || !Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, message: "Choose 1 to 5 stars." };
  const { error } = await rpc("cleaning_signoff", { _visit: visitId, _rating: rating, _note: note.trim().slice(0, 500) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/cleaning/my");
  return { ok: true, message: "Thank you for your rating." };
}

export async function complainCleaningVisit(visitId: string, description: string, photos: string[]): Promise<R> {
  const { rpc, user } = await db("/cleaning/my");
  if (!UUID.test(visitId)) return { ok: false, message: "Visit not found." };
  const safe = (photos ?? []).filter((p) => p.startsWith(`requests/${user.id}/`)).slice(0, 10);
  const { error } = await rpc("cleaning_complain", { _visit: visitId, _description: description.trim().slice(0, 2000), _photos: safe });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/cleaning/my");
  return { ok: true, message: "Thank you. We will review this and call you." };
}

export async function decideCleaningExtra(extraId: string, approve: boolean): Promise<R & { invoiceId?: string }> {
  const { rpc } = await db("/cleaning/my");
  if (!UUID.test(extraId)) return { ok: false, message: "Not found." };
  const { data, error } = await rpc("cleaning_extra_decide", { _extra: extraId, _approve: approve === true });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/cleaning/my");
  const r = data as { status: string; invoice_id?: string };
  return { ok: true, message: approve ? "Approved. Please pay the extra-work bill below." : "Declined. The crew will continue with the original job.", invoiceId: r.invoice_id };
}

export async function cancelCleaningPlan(subId: string, undo: boolean): Promise<R> {
  const { rpc } = await db("/cleaning/my");
  if (!UUID.test(subId)) return { ok: false, message: "Plan not found." };
  const { error } = await rpc("cleaning_plan_cancel", { _sub: subId, _undo: undo === true });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/cleaning/my");
  return { ok: true, message: undo ? "Your plan will continue and renew as normal." : "Your plan will end at the close of the paid period. Visits already paid for still happen." };
}

export async function pauseCleaningPlan(subId: string, from: string, until: string): Promise<R> {
  const { rpc } = await db("/cleaning/my");
  if (!UUID.test(subId) || !DATE.test(from) || !DATE.test(until)) return { ok: false, message: friendlyError("slot_invalid") };
  const { error } = await rpc("cleaning_plan_pause", { _sub: subId, _from: from, _until: until });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/cleaning/my");
  return { ok: true, message: "Plan paused. Your paid period has been extended by the paused days." };
}

export async function bookCleaningCredit(creditId: string, date: string, window: string): Promise<R> {
  const { rpc } = await db("/cleaning/my");
  if (!UUID.test(creditId) || !DATE.test(date) || !WINDOWS.includes(window)) return { ok: false, message: friendlyError("slot_invalid") };
  const { error } = await rpc("cleaning_use_credit", { _credit: creditId, _date: date, _window: window });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/cleaning/my");
  return { ok: true, message: "Credit visit booked." };
}
