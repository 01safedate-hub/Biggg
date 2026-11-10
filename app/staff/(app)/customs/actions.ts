"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

type R = { ok: boolean; message: string; id?: string };
const DESK = ["cashier", "secretary", "admin", "super_admin"] as const;
const UUID = /^[0-9a-f-]{36}$/i;

const done = (path: string[], message: string, id?: string): R => { path.forEach((p) => revalidatePath(p)); return { ok: true, message, id }; };

export async function findCustomer(q: string): Promise<{ id: string; full_name: string | null; phone: string | null; email: string | null }[]> {
  const { supabase } = await requireRole([...DESK]);
  const safe = q.trim().replace(/[%,()_\\]/g, " ").trim().slice(0, 60);
  if (safe.length < 3) return [];
  const { data } = await supabase.from("profiles").select("id,full_name,phone,email,status").or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`).eq("status", "active").limit(8);
  return (data ?? []).map(({ id, full_name, phone, email }) => ({ id, full_name, phone, email }));
}

export async function createCustom(input: { name: string; kind: string; mode: string; manager: string; delivery: string; address: string; lat: number | null; lng: number | null; period: string | null; periodFeeKobo: number; notes: string }): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  if (!UUID.test(input.manager)) return { ok: false, message: "Choose the manager's LaundryPoint account." };
  const { data, error } = await supabase.rpc("create_custom", {
    _name: input.name, _kind: input.kind, _mode: input.mode, _manager: input.manager, _delivery: input.delivery,
    _address: input.address || null as unknown as string, _lat: input.lat as number, _lng: input.lng as number,
    _period: input.period as string, _period_fee_kobo: input.periodFeeKobo, _notes: input.notes || null as unknown as string,
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done(["/staff/customs"], "Custom created. Next: set the rate card and add members.", data as string);
}

export async function updateCustom(id: string, patch: Record<string, unknown>): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("update_custom", { _custom: id, _patch: patch as never });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/customs/${id}`, "/staff/customs"], "Saved.");
}

export async function setRates(id: string, rates: { category_id: string; unit: string; price_kobo: number; allowance: number | null }[]): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("set_custom_rates", { _custom: id, _rates: rates as never });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/customs/${id}`], "Rate card saved.");
}

export async function addMember(id: string, name: string, phone: string, email: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("add_custom_member", { _custom: id, _name: name, _phone: phone || null as unknown as string, _email: email || null as unknown as string });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/customs/${id}`], `${name.trim()} added.`);
}

export async function removeMember(id: string, member: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("remove_custom_member", { _member: member });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/customs/${id}`], "Member removed.");
}

export async function addWatcher(id: string, email: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("add_custom_watcher", { _custom: id, _email: email });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/customs/${id}`], "Link emailed.");
}

export async function removeWatcher(id: string, watcher: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("remove_custom_watcher", { _watcher: watcher });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/customs/${id}`], "Removed.");
}

export async function recordDeposit(id: string, amountKobo: number, mode: string, moneyPoint: string, note: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("record_custom_deposit", { _custom: id, _amount_kobo: amountKobo, _mode: mode, _money_point: moneyPoint, _note: note || null as unknown as string });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/customs/${id}`, "/staff/customs"], "Deposit recorded.");
}

export async function startPeriod(id: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("start_custom_period", { _custom: id });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/customs/${id}`], "Plan period started and the fee was taken from the balance.");
}

export async function adjustBalance(id: string, amountKobo: number, note: string): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("custom_adjust", { _custom: id, _amount_kobo: amountKobo, _note: note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/customs/${id}`], "Balance adjusted.");
}

export async function newBatch(id: string, notes: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { data, error } = await supabase.rpc("create_custom_batch", { _custom: id, _notes: notes || null as unknown as string });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/customs/${id}`], "Batch started. Enter each member's clothes.", data as string);
}

export async function saveLines(order: string, lines: { member: string; category: string; qty: number }[]): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  for (const l of lines) {
    const { error } = await supabase.rpc("set_custom_line", { _order: order, _member: l.member, _category: l.category, _qty: l.qty });
    if (error) return { ok: false, message: friendlyError(error.message) };
  }
  return done([`/staff/customs/batch/${order}`], "Saved.");
}

export async function submitBatch(order: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { data, error } = await supabase.rpc("submit_custom_count", { _order: order });
  if (error) return { ok: false, message: friendlyError(error.message) };
  const r = data as { pieces: number; charge_kobo: number; balance_kobo: number };
  return done([`/staff/customs/batch/${order}`], r.charge_kobo > r.balance_kobo
    ? "Sent for confirmation. The balance does not cover it yet: record a deposit."
    : "Sent for confirmation. It moves to washing once the manager or the members confirm.");
}

export async function reopenBatch(order: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("reopen_custom_count", { _order: order });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/customs/batch/${order}`], "Count reopened.");
}

export async function handOver(order: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const { error } = await supabase.rpc("custom_handover", { _order: order });
  if (error) return { ok: false, message: friendlyError(error.message) };
  return done([`/staff/customs/batch/${order}`, "/staff/shelves"], "Handed over. The shelves are free.");
}
