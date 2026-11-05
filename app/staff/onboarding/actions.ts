"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

const ANY = ["super_admin", "admin", "secretary", "cashier", "delivery_agent", "commission_agent", "washer"] as const;

export async function saveMyProfile(data: Record<string, string>) {
  const { supabase } = await requireRole([...ANY]);
  const { error } = await supabase.rpc("save_my_staff_profile", { _data: data });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/onboarding");
  return { ok: true, message: "Saved." };
}

export async function submitMyOnboarding() {
  const { supabase } = await requireRole([...ANY]);
  const { error } = await supabase.rpc("submit_onboarding");
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff", "layout");
  return { ok: true, message: "Sent. The super admin will review your details." };
}


export async function recordAgentHubArrival(lat: number, lng: number): Promise<{ ok: boolean; message: string }> {
  const { supabase } = await requireRole(["commission_agent"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, message: "Your location could not be validated. Try again." };
  const { data, error } = await supabase.rpc("check_agent_hub_arrival", { _lat: lat, _lng: lng });
  if (error) {
    const raw = error.message ?? "";
    if (raw.includes("outside_hub_radius")) return { ok: false, message: "You are more than 150 metres from the LaundryPoint hub. Move closer to the hub and try again." };
    if (raw.includes("application_not_ready")) return { ok: false, message: "Complete and submit your agent application before checking in at the hub." };
    if (raw.includes("hub_location_not_configured")) return { ok: false, message: "The hub location is not configured in Coverage Zones. Contact the administrator." };
    return { ok: false, message: friendlyError(raw) };
  }
  const result = data as { hub_name?: string; distance_m?: number } | null;
  revalidatePath("/staff/onboarding");
  return { ok: true, message: `Hub location confirmed at ${result?.hub_name ?? "LaundryPoint"} (${result?.distance_m ?? "—"} metres away).` };
}


export async function acceptAgentAgreement(version: string): Promise<{ ok: boolean; message: string }> {
  const { supabase } = await requireRole(["commission_agent"]);
  const { error } = await (supabase as any).rpc("accept_agent_agreement", { _version: version });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/staff/onboarding");
  return { ok: true, message: "Agreement acceptance recorded." };
}
