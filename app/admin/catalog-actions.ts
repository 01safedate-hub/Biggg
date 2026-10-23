"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";

type R = { ok: boolean; message: string };
const fail = (e: { message: string; code?: string }): R => ({
  ok: false,
  message: e.code === "23505" ? "That name is already in use." : e.code === "42501" ? "You do not have permission to do this." : "Could not save. Please check the details and try again.",
});

export async function addMoneyPoint(v: { name: string; kind: string; bank_name: string; account_name: string; account_number: string; opening_balance_kobo: number }): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  if (v.name.trim().length < 2) return { ok: false, message: "Give it a name." };
  if (!["bank", "pos", "cash", "online"].includes(v.kind)) return { ok: false, message: "Choose a type." };
  if (v.account_number && !/^\d{10}$/.test(v.account_number)) return { ok: false, message: "An account number has 10 digits." };
  const { error } = await supabase.from("money_points").insert({
    name: v.name.trim(), kind: v.kind, bank_name: v.bank_name.trim() || null, account_name: v.account_name.trim() || null,
    account_number: v.account_number || null, opening_balance_kobo: v.opening_balance_kobo, active: true,
  });
  if (error) return fail(error);
  revalidatePath("/admin/points");
  return { ok: true, message: "Money point added." };
}

export async function setMoneyPointActive(id: string, active: boolean): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.from("money_points").update({ active }).eq("id", id);
  if (error) return fail(error);
  revalidatePath("/admin/points");
  return { ok: true, message: active ? "Turned on." : "Turned off. Its history stays." };
}

export async function addExpenseCategory(name: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  if (name.trim().length < 2 || name.trim().length > 60) return { ok: false, message: "Use 2 to 60 characters." };
  const { error } = await supabase.from("expense_categories").insert({ name: name.trim() });
  if (error) return fail(error);
  revalidatePath("/admin/categories");
  return { ok: true, message: "Category added." };
}

export async function renameExpenseCategory(id: string, name: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  if (name.trim().length < 2 || name.trim().length > 60) return { ok: false, message: "Use 2 to 60 characters." };
  const { error } = await supabase.from("expense_categories").update({ name: name.trim() }).eq("id", id);
  if (error) return fail(error);
  revalidatePath("/admin/categories");
  return { ok: true, message: "Renamed." };
}

export async function saveItem(id: string, v: { name: string; price_kobo: number; active: boolean }): Promise<R> {
  const { supabase } = await requireRole(["super_admin", "admin"]);
  if (v.name.trim().length < 2) return { ok: false, message: "Give the item a name." };
  if (!Number.isSafeInteger(v.price_kobo) || v.price_kobo < 0) return { ok: false, message: "Enter a valid price." };
  const { error } = await supabase.from("items").update({ name: v.name.trim(), price_kobo: v.price_kobo, active: v.active, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(error);
  revalidatePath("/admin/prices");
  return { ok: true, message: "Saved." };
}

export async function addItem(categoryId: string, v: { name: string; price_kobo: number }): Promise<R> {
  const { supabase } = await requireRole(["super_admin", "admin"]);
  if (v.name.trim().length < 2) return { ok: false, message: "Give the item a name." };
  if (!Number.isSafeInteger(v.price_kobo) || v.price_kobo < 0) return { ok: false, message: "Enter a valid price." };
  const { error } = await supabase.from("items").insert({ category_id: categoryId, name: v.name.trim(), price_kobo: v.price_kobo, active: true });
  if (error) return fail(error);
  revalidatePath("/admin/prices");
  return { ok: true, message: "Item added." };
}

export async function addItemCategory(name: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin", "admin"]);
  const n = name.trim();
  if (n.length < 2 || n.length > 60) return { ok: false, message: "Use 2 to 60 characters." };
  const slug = n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { error } = await supabase.from("item_categories").insert({ name: n, slug, active: true });
  if (error) return fail(error);
  revalidatePath("/admin/prices");
  return { ok: true, message: "Group added." };
}
