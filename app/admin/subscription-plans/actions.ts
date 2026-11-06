"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";

function parseCategoryLimits(value: FormDataEntryValue | null): Record<string, number> {
  let parsed: unknown;
  try { parsed = JSON.parse(String(value ?? "{}")); } catch { throw new Error("Category limits must be valid JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Category limits must be a JSON object.");
  const result: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(parsed as Record<string, unknown>)) {
    const key = rawKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!key || !Number.isSafeInteger(rawValue) || (rawValue as number) < 0) throw new Error("Each category limit must have a category slug and a non-negative whole-number limit.");
    result[key] = rawValue as number;
  }
  return result;
}

function parsePickups(formData: FormData) {
  const pickups = Number(formData.get("pickups_per_month"));
  if (!Number.isSafeInteger(pickups) || pickups < 0 || pickups > 31) throw new Error("Free pickups per month must be a whole number from 0 to 31.");
  return { pickups_per_month: pickups, requires_student_id: formData.get("requires_student_id") === "on" };
}

export async function updatePlan(formData: FormData) {
  const { supabase } = await requireRole(["super_admin"]);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const monthlyPrice = Number(formData.get("monthly_price_kobo"));
  const pieces = Number(formData.get("pieces_per_month"));
  const weekly = Number(formData.get("weekly_allowance"));
  const monthlyDiscount = Number(formData.get("monthly_discount_pct"));
  const threeMonthDiscount = Number(formData.get("three_month_discount_pct"));
  const sixMonthDiscount = Number(formData.get("six_month_discount_pct"));
  const yearlyDiscount = Number(formData.get("yearly_discount_pct"));
  const categoryLimits = parseCategoryLimits(formData.get("category_limits"));
  const active = formData.get("active") === "on";
  if (!id || !name || !Number.isSafeInteger(monthlyPrice) || monthlyPrice < 0 || !Number.isSafeInteger(pieces) || pieces < 1 || !Number.isSafeInteger(weekly) || weekly < 1 || ![monthlyDiscount, threeMonthDiscount, sixMonthDiscount, yearlyDiscount].every((value) => Number.isFinite(value) && value >= 0 && value < 100)) throw new Error("Invalid plan details. Check prices, allowances, and 1, 3, 6 and 12-month discounts.");
  const { error } = await supabase.from("plans").update({ name, monthly_price_kobo: monthlyPrice, pieces_per_month: pieces, weekly_allowance: weekly, monthly_discount_pct: monthlyDiscount, three_month_discount_pct: threeMonthDiscount, six_month_discount_pct: sixMonthDiscount, yearly_discount_pct: yearlyDiscount, active, category_limits: categoryLimits, ...parsePickups(formData) }).eq("id", id);
  if (error) throw new Error("Could not update plan. Check the database constraints and try again.");
  revalidatePath("/admin/subscription-plans");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/");
  revalidatePath("/subscriptions");
  revalidatePath("/subscriptions/checkout");
}

export async function createPlan(formData: FormData) {
  const { supabase } = await requireRole(["super_admin"]);
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const monthlyPrice = Number(formData.get("monthly_price_kobo"));
  const pieces = Number(formData.get("pieces_per_month"));
  const weekly = Number(formData.get("weekly_allowance"));
  const monthlyDiscount = Number(formData.get("monthly_discount_pct"));
  const threeMonthDiscount = Number(formData.get("three_month_discount_pct"));
  const sixMonthDiscount = Number(formData.get("six_month_discount_pct"));
  const yearlyDiscount = Number(formData.get("yearly_discount_pct"));
  const categoryLimits = parseCategoryLimits(formData.get("category_limits"));
  if (!name || !slug || !Number.isSafeInteger(monthlyPrice) || monthlyPrice < 0 || !Number.isSafeInteger(pieces) || pieces < 1 || !Number.isSafeInteger(weekly) || weekly < 1 || ![monthlyDiscount, threeMonthDiscount, sixMonthDiscount, yearlyDiscount].every((value) => Number.isFinite(value) && value >= 0 && value < 100)) throw new Error("Invalid plan details. Check the name, unique URL slug, prices, allowances, and 1, 3, 6 and 12-month discounts.");
  const { data: existing, error: lookupError } = await supabase.from("plans").select("id").eq("slug", slug).maybeSingle();
  if (lookupError) throw new Error("Could not validate the plan slug. Please try again.");
  if (existing) throw new Error("That plan slug already exists. Choose a different slug.");
  const { data: lastPlan } = await supabase.from("plans").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("plans").insert({ name, slug, monthly_price_kobo: monthlyPrice, pieces_per_month: pieces, weekly_allowance: weekly, category_limits: categoryLimits, ...parsePickups(formData), monthly_discount_pct: monthlyDiscount, three_month_discount_pct: threeMonthDiscount, six_month_discount_pct: sixMonthDiscount, yearly_discount_pct: yearlyDiscount, active: formData.get("active") === "on", sort_order: Number(lastPlan?.sort_order ?? 0) + 1 });
  if (error) throw new Error("Could not create plan. Check the slug and database constraints, then try again.");
  revalidatePath("/admin/subscription-plans");
  revalidatePath("/admin/subscriptions");
}
