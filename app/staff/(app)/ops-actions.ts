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

export async function showArrivalCode(orderId: string, step: "arrival" | "delivery" = "arrival"): Promise<R & { code?: string }> {
  const { supabase } = await requireRole(["delivery_agent"]);
  const { data, error } = await supabase.rpc("issue_order_code", { _order: orderId, _step: step });
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

export async function assignDelivery(orderId: string, agentId: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("assign_delivery_agent", { _order: orderId, _agent: agentId });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/dispatch");
  return { ok: true, message: "Delivery agent assigned. The customer has been told." };
}

export async function redispatch(orderId: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("redispatch_delivery", { _order: orderId });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/dispatch");
  return { ok: true, message: "Back in the delivery queue." };
}

export async function hubStep(orderId: string, step: "wash" | "ready"): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc(step === "wash" ? "start_washing" : "mark_ready", { _order: orderId });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/hub");
  return { ok: true, message: step === "wash" ? "Washing started." : "Marked ready. The customer can pay for delivery." };
}

export async function failedDelivery(orderId: string, outcome: string, note: string): Promise<R> {
  const { supabase } = await requireRole(["delivery_agent", ...DESK]);
  const { error } = await supabase.rpc("report_failed_delivery", { _order: orderId, _outcome: outcome, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/staff/jobs/${orderId}`);
  revalidatePath("/staff/dispatch");
  return { ok: true, message: "Logged. The office will follow up with the customer." };
}

export async function correctLine(orderId: string, lineId: string, newItem: string, note: string): Promise<R & { due?: number }> {
  const { supabase } = await requireRole([...DESK]);
  const { data, error } = await supabase.rpc("correct_order_item", { _line: lineId, _new_item: newItem, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath(`/staff/receiving/${orderId}`);
  return { ok: true, message: "Corrected.", due: Number((data as { due_kobo?: number } | null)?.due_kobo ?? 0) };
}

export async function cancelPaidOrder(orderId: string, refundPickup: boolean, note: string): Promise<R & { refund?: number }> {
  const { supabase } = await requireRole([...DESK]);
  const { data, error } = await supabase.rpc("cancel_paid_order", { _order: orderId, _refund_pickup: refundPickup, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/dispatch");
  return { ok: true, message: "Cancelled.", refund: Number((data as { refund_kobo?: number } | null)?.refund_kobo ?? 0) };
}

export async function failedPickup(orderId: string, reason: string, note: string): Promise<R> {
  const { supabase } = await requireRole(["delivery_agent"]);
  const { error } = await supabase.rpc("report_failed_pickup", { _order: orderId, _reason: reason, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/jobs");
  return { ok: true, message: "Logged. The office will call the customer and send another agent." };
}

export async function logContact(orderId: string, outcome: string, note: string, promisedIso: string | null): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("log_contact", { _order: orderId, _outcome: outcome, _note: note, _promised: promisedIso as string });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/dispatch");
  return { ok: true, message: "Call logged." };
}

export async function deskResolveIssue(id: string, action: "resolve" | "reject" | "escalate", text: string, naira: number): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const kobo = Math.round((Number.isFinite(naira) ? naira : 0) * 100);
  const { data, error } = await supabase.rpc("desk_resolve_issue", { _id: id, _action: action, _text: text, _comp_kobo: kobo });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/issues");
  return { ok: true, message: (data as { result?: string } | null)?.result === "escalated" ? "Sent to the super admin." : "Saved. The customer has been told." };
}

export async function saveShiftTemplate(staff: string, weekday: number, start: string | null, end: string | null, active: boolean): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("set_shift_template", { _staff: staff, _weekday: weekday, _start: start as string, _end: end as string, _active: active });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/roster");
  return { ok: true, message: "Saved." };
}

export async function makeShifts(days: number): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const from = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  const to = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(Date.now() + Math.min(Math.max(days, 1), 60) * 86400000));
  const { data, error } = await supabase.rpc("generate_shifts", { _from: from, _to: to });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/roster");
  return { ok: true, message: Number(data) > 0 ? `${data} shift${Number(data) === 1 ? "" : "s"} added.` : "Nothing new to add. Every planned shift already exists." };
}

export async function addOneShift(staff: string, date: string, start: string, end: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("add_shift", { _staff: staff, _date: date, _start: start, _end: end });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/roster");
  return { ok: true, message: "Shift added." };
}

export async function cancelShift(id: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { data: s } = await supabase.from("shifts").select("starts_at").eq("id", id).maybeSingle();
  if (!s || new Date(s.starts_at).getTime() <= Date.now()) return { ok: false, message: "Only shifts that have not started can be removed." };
  const { count } = await supabase.from("attendance").select("id", { count: "exact", head: true }).eq("shift_id", id);
  if ((count ?? 0) > 0) return { ok: false, message: "This shift already has a check-in and cannot be removed." };
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) return { ok: false, message: "Could not remove the shift." };
  revalidatePath("/staff/roster");
  return { ok: true, message: "Shift removed." };
}
