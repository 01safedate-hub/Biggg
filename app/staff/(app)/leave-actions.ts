"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean; message: string };

function msg(error: { message?: string } | null, fallback: string): Result {
  const raw = error?.message ?? "";
  const labels: Record<string,string> = {
    invalid_leave_dates: "Choose valid future dates.",
    invalid_leave_type: "Choose an active leave type.",
    leave_dates_overlap: "Those dates overlap another pending or approved leave request.",
    insufficient_leave_balance: "There is not enough leave balance for these dates.",
    manager_only: "Only a roster manager can decide requests.",
    leave_request_not_pending: "This request has already been decided.",
    leave_not_cancellable: "This leave request can no longer be cancelled.",
    leave_already_started: "Approved leave cannot be cancelled after it starts.",
    shift_not_found_or_started: "That upcoming shift could not be found.",
    swap_already_pending: "A swap request already exists for this shift.",
    swap_not_pending: "This swap has already been responded to.",
    swap_not_accepted: "The swap must be accepted before a manager can approve it.",
    staff_only: "Your account does not have a staff role.",
    not_authenticated: "Your session expired. Sign in again.",
    delivery_agent_only: "Your account role cannot request this shift swap.",
    staff_role_not_eligible: "Shift swaps are available to delivery agents, cashiers and secretaries.",
    not_allowed: "Your account is not active or is not permitted to request a shift swap.",
    invalid_target_staff: "Choose an active colleague with the same staff role.",
    invalid_target_station: "Choose a colleague assigned to your same station.",
    cancellation_reason_required: "Enter a reason before declining or cancelling this swap.",
    swap_not_cancellable: "This swap can no longer be cancelled.",
    cannot_swap_with_self: "Choose a colleague other than yourself.",
    swap_target_missing: "Choose a colleague to receive the shift.",
    swap_target_required: "Choose a colleague to receive the shift.",
    
    swap_overlap: "That colleague already has a shift at the same time.",
    swap_rest_rule: "That colleague would have less than 11 hours off between shifts.",
    swap_weekly_limit: "That colleague would exceed the six-day weekly limit.",
    shift_too_long: "Shifts longer than 10 hours cannot be transferred.",
    leave_must_stay_within_year: "A leave request must fall within one calendar year."
  };
  const key = Object.keys(labels).find(k => raw.includes(k));
  return { ok: !error, message: error ? (key ? labels[key] : fallback) : "Saved successfully." };
}

export async function submitLeave(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const type = String(formData.get("leave_type_id") ?? "");
  const start = String(formData.get("start_date") ?? "");
  const end = String(formData.get("end_date") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!type || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return {ok:false,message:"Choose a leave type and valid start/end dates."};
  const { error } = await supabase.rpc("submit_leave_request", {_leave_type:type,_start:start,_end:end,_reason:reason});
  revalidatePath("/staff/leave");
  revalidatePath("/admin/roster");
  return msg(error, "Could not submit leave request.");
}

export async function cancelLeave(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_leave_request", {_request:id,_note:null});
  revalidatePath("/staff/leave");
  revalidatePath("/admin/roster");
  return msg(error, "Could not cancel this leave request.");
}

export async function decideLeave(id: string, approve: boolean, note: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_leave_request", {_request:id,_approve:approve,_note:note || null});
  revalidatePath("/staff/leave");
  revalidatePath("/admin/roster");
  return msg(error, "Could not update the leave request.");
}

export async function requestSwap(shiftId: string, targetStaff: string, reason: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_shift_swap", {_shift:shiftId,_target_staff:targetStaff || null,_reason:reason || null});
  revalidatePath("/staff/leave");
  revalidatePath("/admin/roster");
  return msg(error, "Could not submit this shift-swap request.");
}

export async function respondSwap(id: string, accept: boolean, note: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_shift_swap", {_swap:id,_accept:accept,_note:note || null});
  revalidatePath("/staff/leave");
  revalidatePath("/admin/roster");
  return msg(error, "Could not respond to this swap.");
}

export async function cancelSwap(id: string, reason: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_shift_swap", {_swap:id,_reason:reason});
  revalidatePath("/staff/leave");
  revalidatePath("/admin/roster");
  return msg(error, "Could not cancel this shift-swap request.");
}

export async function decideSwap(id: string, approve: boolean, note: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_shift_swap", {_swap:id,_approve:approve,_note:note || null});
  revalidatePath("/staff/leave");
  revalidatePath("/admin/roster");
  return msg(error, "Could not decide this swap.");
}

export async function saveHoliday(formData: FormData): Promise<Result> {
 const supabase = await createClient();
 const date = String(formData.get("holiday_date") ?? "");
 const name = String(formData.get("holiday_name") ?? "").trim();
 const dayInLieu = formData.get("grants_day_in_lieu") === "on";
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || name.length < 2) return {ok:false,message:"Enter a holiday name and valid date."};
 const {error}=await supabase.rpc("save_public_holiday",{_date:date,_name:name,_day_in_lieu:dayInLieu});
 revalidatePath("/staff/leave");
 return msg(error,"Could not save public holiday.");
}
export async function deleteHoliday(id: string): Promise<Result> {
 const supabase = await createClient();
 const {error}=await supabase.rpc("delete_public_holiday",{_id:id});
 revalidatePath("/staff/leave");
 return msg(error,"Could not remove public holiday.");
}
export async function saveBlackout(formData: FormData): Promise<Result> {
 const supabase = await createClient();
 const date = String(formData.get("blackout_date") ?? "");
 const reason = String(formData.get("blackout_reason") ?? "").trim();
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || reason.length < 2) return {ok:false,message:"Enter a reason and valid blackout date."};
 const {error}=await supabase.rpc("save_roster_blackout",{_date:date,_reason:reason,_zone:null});
 revalidatePath("/staff/leave");
 revalidatePath("/staff/roster");
 return msg(error,"Could not save roster blackout.");
}
export async function deleteBlackout(id: string): Promise<Result> {
 const supabase = await createClient();
 const {error}=await supabase.rpc("delete_roster_blackout",{_id:id});
 revalidatePath("/staff/leave");
 revalidatePath("/staff/roster");
 return msg(error,"Could not remove roster blackout.");
}
