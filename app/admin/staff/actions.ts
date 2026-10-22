"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

export type ActionResult = { ok: boolean; message: string };

async function callStaffAdmin(body: Record<string, unknown>): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const { supabase } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.functions.invoke("staff-admin", { body });
  if (error) {
    let code = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try { code = (await ctx.json())?.error ?? code; } catch { /* keep message */ }
    }
    return { ok: false, error: friendlyError(String(code)) };
  }
  return { ok: true, data: data as Record<string, unknown> };
}

export async function inviteStaff(input: { email: string; full_name: string; phone: string; roles: string[] }): Promise<ActionResult> {
  const r = await callStaffAdmin({ action: "invite", ...input });
  if (!r.ok) return { ok: false, message: r.error ?? "Could not send the invitation." };
  revalidatePath("/admin/staff");
  return r.data?.mode === "existing_account"
    ? { ok: true, message: `${r.data.name ?? "This person"} already had an account, so the access was added. No email was needed.` }
    : { ok: true, message: `Invitation sent to ${input.email}. It stays valid for the time set in Supabase, and you can resend it.` };
}

export async function resendInvite(userId: string): Promise<ActionResult> {
  const r = await callStaffAdmin({ action: "resend", user_id: userId });
  return r.ok ? { ok: true, message: "Invitation sent again." } : { ok: false, message: r.error ?? "Could not resend." };
}

export async function changeStatus(userId: string, status: string, reason: string): Promise<ActionResult> {
  const r = await callStaffAdmin({ action: "set_status", user_id: userId, status, reason });
  if (!r.ok) return { ok: false, message: r.error ?? "Could not change the status." };
  revalidatePath("/admin/staff");
  return { ok: true, message: status === "active" ? "Access restored." : "Access removed. They can no longer sign in." };
}

export async function changeRoles(userId: string, roles: string[]): Promise<ActionResult> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("set_staff_roles", { _user: userId, _roles: roles });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/staff");
  return { ok: true, message: roles.length ? "Roles saved." : "All staff access removed. They are now a customer." };
}
