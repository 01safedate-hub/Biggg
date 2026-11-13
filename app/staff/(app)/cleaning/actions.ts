"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type Role } from "@/lib/roles";
import { friendlyError as baseError } from "@/lib/rpc-errors";
import { CLEANING_ADMIN, CLEANING_ALL, CLEANING_CREW, CLEANING_DESK, CLEANING_MANAGER, CLEANING_MONEY } from "@/lib/cleaning-roles";

type R = { ok: boolean; message: string };
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const DESK = CLEANING_DESK;
const MANAGER = CLEANING_MANAGER;
const MONEY = CLEANING_MONEY;
const ADMIN = CLEANING_ADMIN;
const CREW = CLEANING_CREW;
const QUOTERS: Role[] = ["inspector", ...CLEANING_DESK];

function friendlyError(message: string | undefined): string {
  const m = String(message ?? "");
  if (m.includes("not_served")) return "This address is outside the cleaning service area.";
  if (m.includes("slot_unavailable")) return "That day is full. Choose another day, or add crew shifts.";
  return baseError(m);
}

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
async function staff(roles: Role[]) {
  const { supabase, user } = await requireRole(roles);
  const rpc = ((fn: string, args?: Record<string, unknown>) => supabase.rpc(fn as never, args as never)) as unknown as Rpc;
  return { supabase, user, rpc };
}
function done(paths: string[], message: string): R {
  for (const p of paths) revalidatePath(p);
  return { ok: true, message };
}

// ---------- Requests ----------
export async function staffCreateRequest(p: Record<string, unknown>): Promise<R & { id?: string }> {
  const { rpc } = await staff(DESK);
  const { data, error } = await rpc("cleaning_request_staff_create", { _p: p });
  if (error) return { ok: false, message: friendlyError(error.message) };
  const r = data as { id: string; request_no: number };
  revalidatePath("/staff/cleaning");
  return { ok: true, message: `Request #${r.request_no} saved.`, id: r.id };
}

export async function updateRequest(id: string, patch: Record<string, unknown>): Promise<R> {
  const { rpc } = await staff(DESK);
  if (!UUID.test(id)) return { ok: false, message: "Request not found." };
  const { error } = await rpc("cleaning_request_update", { _id: id, _patch: patch });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/cleaning/requests/${id}`, "/staff/cleaning"], "Saved.");
}

export async function bookInspection(requestId: string, p: { mode: string; scheduled_for: string | null; inspector_id: string | null; waive: boolean; waive_reason: string }): Promise<R> {
  const { rpc } = await staff(DESK);
  if (!UUID.test(requestId)) return { ok: false, message: "Request not found." };
  const { data, error } = await rpc("cleaning_book_inspection", { _request: requestId, _p: p });
  if (error) return { ok: false, message: friendlyError(error.message) };
  const r = data as { fee_kobo: number };
  return done([`/staff/cleaning/requests/${requestId}`, "/staff/cleaning", "/staff/cleaning/board"],
    p.mode === "remote" ? "Remote quote set. Ask the customer for photos or a video call." : r.fee_kobo > 0 ? "Inspection booked. The customer has been asked to pay the fee." : "Inspection booked with no fee.");
}

export async function inspectionDone(inspectionId: string, requestId: string, findings: Record<string, string>, photos: string[]): Promise<R> {
  const { rpc } = await staff(CLEANING_ALL);
  if (!UUID.test(inspectionId)) return { ok: false, message: "Inspection not found." };
  const { error } = await rpc("cleaning_inspection_done", { _id: inspectionId, _findings: findings, _photos: photos.slice(0, 30) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/cleaning/requests/${requestId}`, "/staff/cleaning/board"], "Inspection recorded. Build the quote next.");
}

// ---------- Quotes ----------
export async function quotePreview(requestId: string, p: Record<string, unknown>): Promise<R & { data?: Record<string, unknown> }> {
  const { rpc } = await staff(CLEANING_ALL);
  if (!UUID.test(requestId)) return { ok: false, message: "Request not found." };
  const { data, error } = await rpc("cleaning_quote_preview", { _request: requestId, _p: p });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return { ok: true, message: "", data: data as Record<string, unknown> };
}

export async function quoteSave(requestId: string, p: Record<string, unknown>, send: boolean): Promise<R> {
  const { rpc } = await staff(QUOTERS);
  if (!UUID.test(requestId)) return { ok: false, message: "Request not found." };
  const { data, error } = await rpc("cleaning_quote_save", { _request: requestId, _p: p });
  if (error) return { ok: false, message: friendlyError(error.message) };
  if (!send) return done([`/staff/cleaning/requests/${requestId}`], "Draft saved.");
  const sent = await rpc("cleaning_quote_send", { _quote: String(data) });
  if (sent.error) return { ok: false, message: `Draft saved, but not sent: ${friendlyError(sent.error.message)}` };
  return done([`/staff/cleaning/requests/${requestId}`, "/staff/cleaning"],
    sent.data === "sent" ? "Quote sent. The customer has been notified." : "Saved. It needs admin approval before it goes to the customer; admin has been emailed.");
}

export async function quoteSend(quoteId: string, requestId: string, approve: boolean): Promise<R> {
  const { rpc } = await staff(approve ? ADMIN : QUOTERS);
  if (!UUID.test(quoteId)) return { ok: false, message: "Quote not found." };
  const { data, error } = await rpc(approve ? "cleaning_quote_approve" : "cleaning_quote_send", { _quote: quoteId });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/cleaning/requests/${requestId}`, "/staff/cleaning"], data === "sent" ? "Quote sent to the customer." : "Waiting for admin approval.");
}

// ---------- Desk payments ----------
export async function deskPay(invoiceId: string, mode: string, moneyPoint: string, note: string, back: string): Promise<R> {
  const { rpc } = await staff(MONEY);
  if (!UUID.test(invoiceId) || !UUID.test(moneyPoint)) return { ok: false, message: friendlyError("money_point_required") };
  const { error } = await rpc("cleaning_desk_pay", { _invoice: invoiceId, _mode: mode, _money_point: moneyPoint, _note: note.trim().slice(0, 300) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([back, "/staff/cleaning/invoices", "/staff/cleaning/board"], "Payment recorded.");
}

// ---------- Board ----------
export async function assignCrew(visitId: string, lead: string, cleaners: string[]): Promise<R> {
  const { rpc } = await staff(MANAGER);
  if (!UUID.test(visitId) || !UUID.test(lead)) return { ok: false, message: friendlyError("cleaning_lead_required") };
  const { error } = await rpc("cleaning_assign_crew", { _visit: visitId, _lead: lead, _cleaners: cleaners.filter((c) => UUID.test(c)) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done(["/staff/cleaning/board"], "Crew assigned and notified.");
}

export async function setStartTime(visitId: string, time: string | null): Promise<R> {
  const { rpc } = await staff(MANAGER);
  if (!UUID.test(visitId) || (time && !/^\d{2}:\d{2}$/.test(time))) return { ok: false, message: friendlyError("slot_invalid") };
  const { error } = await rpc("cleaning_set_start_time", { _visit: visitId, _time: time || null });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done(["/staff/cleaning/board"], time ? "Start time set. The customer has been told." : "Start time cleared.");
}

export async function moveVisit(visitId: string, date: string, window: string): Promise<R> {
  const { rpc } = await staff(MANAGER);
  if (!UUID.test(visitId) || !DATE.test(date) || !["morning", "afternoon"].includes(window)) return { ok: false, message: friendlyError("slot_invalid") };
  const { error } = await rpc("cleaning_reschedule", { _visit: visitId, _date: date, _window: window });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done(["/staff/cleaning/board"], "Visit moved. Assign the crew again if the day changed.");
}

export async function cancelVisit(visitId: string, reason: string, byUs: boolean): Promise<R> {
  const { rpc } = await staff(MANAGER);
  if (!UUID.test(visitId)) return { ok: false, message: "Visit not found." };
  const { error } = await rpc("cleaning_cancel_visit", { _visit: visitId, _reason: reason.trim().slice(0, 300), _by_us: byUs === true });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done(["/staff/cleaning/board", "/staff/cleaning/plans"], byUs ? "Visit cancelled. Plan customers get a free credit visit." : "Visit cancelled and counted as used.");
}

// ---------- Crew ----------
async function crewCall(fn: string, args: Record<string, unknown>, ok: string): Promise<R & { data?: unknown }> {
  const { rpc } = await staff(CREW);
  const { data, error } = await rpc(fn, args);
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/cleaning/jobs");
  revalidatePath("/staff/cleaning/board");
  return { ok: true, message: ok, data };
}

export async function crewOnWay(visitId: string): Promise<R> {
  if (!UUID.test(visitId)) return { ok: false, message: "Visit not found." };
  return crewCall("cleaning_visit_on_way", { _visit: visitId }, "Customer told you are on the way.");
}

export async function crewArrive(visitId: string, code: string): Promise<R> {
  if (!UUID.test(visitId) || !/^\d{4}$/.test(code)) return { ok: false, message: "The arrival code is 4 digits." };
  const r = await crewCall("cleaning_visit_arrive", { _visit: visitId, _code: code }, "Code correct. Take before photos, then start.");
  if (!r.ok) return r;
  const d = r.data as { ok: boolean; attempts_left?: number };
  return d.ok ? r : { ok: false, message: `That code is not right. ${d.attempts_left ?? 0} tries left.` };
}

export async function crewPhotos(visitId: string, phase: "before" | "after", paths: string[]): Promise<R> {
  if (!UUID.test(visitId)) return { ok: false, message: "Visit not found." };
  return crewCall("cleaning_visit_photos", { _visit: visitId, _phase: phase, _paths: paths.slice(0, 40) }, "Photos saved.");
}

export async function crewChecklist(visitId: string, checklist: { item: string; done: boolean; note: string | null }[]): Promise<R> {
  if (!UUID.test(visitId)) return { ok: false, message: "Visit not found." };
  return crewCall("cleaning_visit_checklist", { _visit: visitId, _checklist: checklist.slice(0, 200) }, "Checklist saved.");
}

export async function crewExtra(visitId: string, addons: Record<string, number>, label: string, kobo: number, minutes: number): Promise<R> {
  if (!UUID.test(visitId)) return { ok: false, message: "Visit not found." };
  return crewCall("cleaning_visit_extra", { _visit: visitId, _addons: addons, _custom_label: label.trim(), _custom_kobo: Math.max(0, Math.round(kobo)), _custom_minutes: Math.max(0, Math.round(minutes)) },
    "Sent to the customer to approve. Do not start the extra work until they approve.");
}

export async function crewFinish(visitId: string, code: string): Promise<R> {
  if (!UUID.test(visitId) || (code && !/^\d{4}$/.test(code))) return { ok: false, message: "The completion code is 4 digits." };
  const r = await crewCall("cleaning_visit_finish", { _visit: visitId, _code: code || null }, code ? "Signed off. Well done." : "Finished. The customer will sign off in the app.");
  if (!r.ok) return r;
  const d = r.data as { ok: boolean; attempts_left?: number };
  return d.ok ? r : { ok: false, message: `That code is not right. ${d.attempts_left ?? 0} tries left.` };
}

export async function crewNoShow(visitId: string, note: string): Promise<R> {
  if (!UUID.test(visitId)) return { ok: false, message: "Visit not found." };
  return crewCall("cleaning_visit_no_show", { _visit: visitId, _note: note.trim().slice(0, 300) }, "Recorded. The office has been told.");
}

export async function crewIssue(visitId: string, kind: string, description: string, photos: string[]): Promise<R> {
  const { rpc } = await staff(CLEANING_ALL);
  if (!UUID.test(visitId)) return { ok: false, message: "Visit not found." };
  const { error } = await rpc("cleaning_report_issue", { _visit: visitId, _kind: kind, _description: description.trim().slice(0, 2000), _photos: photos.slice(0, 20) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done(["/staff/cleaning/jobs", "/staff/cleaning/issues"], kind === "unsafe" ? "Visit stopped and the office told. Leave safely." : "Reported to the office.");
}

// ---------- Issues and plans ----------
export async function resolveIssue(issueId: string, action: string, outcome: string, date: string | null, window: string | null, payoutKobo: number | null): Promise<R> {
  const { rpc } = await staff(MANAGER);
  if (!UUID.test(issueId)) return { ok: false, message: "Issue not found." };
  const { error } = await rpc("cleaning_issue_resolve", { _issue: issueId, _action: action, _outcome: outcome.trim().slice(0, 1000), _date: date || null, _window: window || null, _payout_kobo: payoutKobo });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done(["/staff/cleaning/issues", "/staff/cleaning/board"], action === "reclean" ? "Free re-clean booked. Assign a crew on the board." : "Issue closed.");
}

export async function managePlan(subId: string, action: "cancel" | "undo" | "pause", from?: string, until?: string): Promise<R> {
  const { rpc } = await staff(MANAGER);
  if (!UUID.test(subId)) return { ok: false, message: "Plan not found." };
  const { error } = action === "pause"
    ? await rpc("cleaning_plan_pause", { _sub: subId, _from: from, _until: until })
    : await rpc("cleaning_plan_cancel", { _sub: subId, _undo: action === "undo" });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done(["/staff/cleaning/plans"], action === "pause" ? "Plan paused and its end date moved back." : action === "undo" ? "Plan will renew as normal." : "Plan will end at the close of its paid period.");
}

// ---------- Settings ----------
export async function saveCleaningSettings(patch: Record<string, unknown>): Promise<R> {
  const { rpc } = await staff(ADMIN);
  const { error } = await rpc("cleaning_settings_save", { _patch: patch });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done(["/staff/cleaning/settings", "/cleaning"], "Settings saved.");
}

export async function saveRateCard(data: Record<string, unknown>, note: string): Promise<R> {
  const { rpc } = await staff(ADMIN);
  const { data: v, error } = await rpc("cleaning_rate_save", { _data: data, _note: note.trim().slice(0, 200) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done(["/staff/cleaning/settings", "/cleaning", "/cleaning/prices"], `Rate card version ${v} is now live. Quotes already sent keep their price.`);
}

export async function savePlanType(p: Record<string, unknown>): Promise<R> {
  const { rpc } = await staff(ADMIN);
  const { error } = await rpc("cleaning_plan_type_save", { _p: p });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done(["/staff/cleaning/settings", "/cleaning/plans"], "Plan saved.");
}

export async function saveZoneDays(zoneId: string, days: number[]): Promise<R> {
  const { rpc } = await staff(MANAGER);
  if (!UUID.test(zoneId)) return { ok: false, message: "Area not found." };
  const { error } = await rpc("cleaning_zone_days_save", { _zone: zoneId, _days: days.filter((d) => d >= 1 && d <= 6) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done(["/staff/cleaning/settings"], "Area days saved.");
}
