"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";

export async function updatePlan(formData: FormData) {
  const { supabase } = await requireRole(["super_admin"]);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const monthlyPrice = Number(formData.get("monthly_price_kobo"));
  const pieces = Number(formData.get("pieces_per_month"));
  const weekly = Number(formData.get("weekly_allowance"));
  const overage = Number(formData.get("overage_price_kobo"));
  const discount = Number(formData.get("yearly_discount_pct"));
  const active = formData.get("active") === "on";
  if (!id || !name || !Number.isSafeInteger(monthlyPrice) || monthlyPrice < 0 || !Number.isSafeInteger(pieces) || pieces < 1 || !Number.isSafeInteger(weekly) || weekly < 1 || !Number.isSafeInteger(overage) || overage < 0 || !Number.isFinite(discount) || discount < 0 || discount > 100) {
    throw new Error("Invalid plan details. Check prices, allowances, and yearly discount.");
  }
  const { error } = await supabase.from("plans").update({
    name, monthly_price_kobo: monthlyPrice, pieces_per_month: pieces,
    weekly_allowance: weekly, overage_price_kobo: overage,
    yearly_discount_pct: discount, active,
  }).eq("id", id);
  if (error) throw new Error("Could not update plan. Check the database constraints and try again.");
  revalidatePath("/admin/subscription-plans");
  revalidatePath("/admin/subscriptions");
}
