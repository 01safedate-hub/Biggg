"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

export async function registerPartnerInterest(message: string): Promise<{ ok: boolean; message: string; already?: boolean }> {
  const { supabase } = await requireUser("/account/partner");
  const { data, error } = await supabase.rpc("register_partner_interest", { _message: message.slice(0, 500) });
  if (error) {
    if (error.message.includes("already_partner")) return { ok: false, message: "You are already a LaundryPoint partner. Open the staff app to see your clients and commission." };
    return { ok: false, message: friendlyError(error.message) };
  }
  revalidatePath("/account/partner");
  const already = Boolean((data as { already?: boolean } | null)?.already);
  return { ok: true, already, message: already ? "We already have your request. Our team will contact you soon." : "Thank you! Our team will call or WhatsApp you to arrange your hub visit." };
}
