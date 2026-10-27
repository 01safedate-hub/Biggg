"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/rpc-errors";

export async function checkInForShift(lat: number, lng: number): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your session has expired. Sign in again, then retry check-in." };
  const [{ data: roleRows }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("profiles").select("status").eq("id", user.id).maybeSingle(),
  ]);
  const roles = (roleRows ?? []).map(r => r.role as string);
  if (profile?.status && profile.status !== "active") return { ok: false, message: "Your staff account is not active yet. Ask an administrator to activate it." };
  const staffRoles = ["super_admin", "admin", "secretary", "cashier", "delivery_agent"];
  if (!roles.some(role => staffRoles.includes(role))) return { ok: false, message: "Your account does not have an eligible staff role for attendance check-in." };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, message: "Your location could not be validated. Try again." };
  const { error } = await supabase.rpc("check_in", { _lat: lat, _lng: lng });
  if (error) {
    const raw = error.message ?? "";
    if (raw.includes("station_not_configured")) return { ok: false, message: "No station is assigned to your account. Ask an administrator to set your pickup station in Admin → Staff." };
    if (raw.includes("outside_zone")) return { ok: false, message: "You are more than 150 metres from your assigned station. Move to the correct station and try again." };
    if (raw.includes("shift_not_started")) return { ok: false, message: "Your shift has not started yet. Check in shortly before the scheduled start time." };
    if (raw.includes("no_shift")) return { ok: false, message: "You do not have a shift available for check-in right now. Contact your supervisor if this is unexpected." };
    if (raw.includes("already_checked_in")) return { ok: false, message: "You are already checked in for this shift." };
    return { ok: false, message: friendlyError(raw) };
  }
  revalidatePath("/staff/my-shifts");
  revalidatePath("/staff/dispatch");
  return { ok: true, message: "Check-in successful. Your attendance has been recorded." };
}