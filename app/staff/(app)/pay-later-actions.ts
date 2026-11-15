"use server";

// Quick orders (agents in the field) and pay later (walk-in and quick orders).
// The database enforces every rule: agents can never mark an order paid, unpaid clothes never leave,
// and the unpaid limits. These actions only check the role, clean the input and explain errors.
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

type R = { ok: boolean; message: string };
const AGENTS = ["delivery_agent", "commission_agent"] as const;
const DESK = ["secretary", "admin", "super_admin"] as const;
const MONEY = ["cashier", "secretary", "admin", "super_admin"] as const;

async function fnError(error: { message: string }): Promise<string> {
  let code = error.message;
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") { try { code = (await ctx.json())?.error ?? code; } catch { /* keep */ } }
  return friendlyError(String(code));
}

function refresh(orderId?: string) {
  revalidatePath("/staff/quick-order");
  revalidatePath("/staff/unpaid");
  if (orderId) {
    revalidatePath(`/staff/jobs/${orderId}`);
    revalidatePath(`/staff/walkin/${orderId}`);
    revalidatePath(`/staff/orders/${orderId}`);
  }
}

export async function startQuickOrder(input: {
  name: string; phone: string; email: string; whatsappOptIn: boolean;
  lat: number; lng: number; accuracy: number; address: string; notes: string;
}): Promise<R & { id?: string }> {
  const { supabase } = await requireRole([...AGENTS]);
  const name = input.name.trim().replace(/\s+/g, " ");
  const digits = input.phone.replace(/\D/g, "");
  const email = input.email.trim();
  const address = input.address.trim();
  if (name.length < 2 || name.length > 80) return { ok: false, message: "Enter the customer's name." };
  if (digits.length < 10 || digits.length > 15) return { ok: false, message: "Enter a phone number with 10 to 15 digits." };
  if (address.length < 5 || address.length > 300) return { ok: false, message: "Enter the customer's address (at least 5 characters)." };
  if (![input.lat, input.lng, input.accuracy].every((n) => Number.isFinite(n))) return { ok: false, message: "Get your location first." };
  if (input.accuracy > 300) return { ok: false, message: "Your location is not accurate enough. Go outside or turn on GPS and try again." };
  const c = await supabase.functions.invoke("desk-walkin", {
    body: { full_name: name, phone: input.phone.trim(), whatsapp_opt_in: input.whatsappOptIn === true, ...(email ? { email } : {}) },
  });
  if (c.error) return { ok: false, message: await fnError(c.error) };
  const customerId = (c.data as { id?: string } | null)?.id;
  if (!customerId) return { ok: false, message: "Something went wrong. Please try again." };
  const { data, error } = await supabase.rpc("agent_quick_order_start", {
    _customer: customerId, _lat: input.lat, _lng: input.lng, _accuracy: Math.round(input.accuracy),
    _address: address, _notes: input.notes.trim().slice(0, 500),
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  const id = (data as { order_id?: string } | null)?.order_id;
  refresh();
  return id ? { ok: true, message: "", id } : { ok: false, message: "Something went wrong. Please try again." };
}

export async function finishQuickOrder(orderId: string, choice: "transferred" | "pay_later", note: string): Promise<R> {
  const { supabase } = await requireRole([...AGENTS]);
  if (choice !== "transferred" && choice !== "pay_later") return { ok: false, message: "Choose what happened." };
  const n = note.trim().slice(0, 200);
  if (choice === "transferred" && n.length < 3) return { ok: false, message: "Enter the name on the customer's bank transfer." };
  if (choice === "pay_later" && n.length < 5) return { ok: false, message: "Say why the customer could not pay now (at least 5 characters)." };
  const { error } = await supabase.rpc("agent_quick_order_finish", { _order: orderId, _choice: choice, _note: n });
  if (error) return { ok: false, message: friendlyError(error.message) };
  refresh(orderId);
  return { ok: true, message: choice === "transferred" ? "Saved. The office will check the money arrived." : "Saved as pay later. Remind the customer to pay." };
}

export async function cancelQuickOrder(orderId: string, reason: string): Promise<R> {
  const { supabase } = await requireRole([...AGENTS]);
  if (reason.trim().length < 3) return { ok: false, message: "Please give a reason." };
  const { error } = await supabase.rpc("agent_quick_order_cancel", { _order: orderId, _reason: reason.trim().slice(0, 200) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  refresh(orderId);
  return { ok: true, message: "Cancelled." };
}

// Agents (own quick orders only) and the desk can add an email to a customer who had none.
export async function addCustomerEmail(customerId: string, email: string, orderId: string): Promise<R> {
  const { supabase } = await requireRole([...AGENTS, ...DESK]);
  const mail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return { ok: false, message: "Enter a valid email address." };
  const { data, error } = await supabase.functions.invoke("desk-walkin", { body: { upgrade_id: customerId, email: mail } });
  if (error) return { ok: false, message: await fnError(error) };
  if (!(data as { ok?: boolean } | null)?.ok) return { ok: false, message: "Something went wrong. Please try again." };
  refresh(orderId);
  return { ok: true, message: "Done. We emailed them a link to choose a password." };
}

export async function deskMarkPayLater(orderId: string, reason: string): Promise<R> {
  const { supabase } = await requireRole([...DESK]);
  const r = reason.trim().slice(0, 200);
  if (r.length < 5) return { ok: false, message: "Say why the customer cannot pay now (at least 5 characters)." };
  const { error } = await supabase.rpc("desk_pay_later", { _order: orderId, _reason: r });
  if (error) return { ok: false, message: friendlyError(error.message) };
  refresh(orderId);
  revalidatePath("/staff/walkin");
  return { ok: true, message: "Saved as pay later. The clothes can be washed but not released until paid." };
}

export async function confirmPayLater(orderId: string, mode: "cash" | "transfer" | "pos", moneyPoint: string, note: string): Promise<R> {
  const { supabase } = await requireRole([...MONEY]);
  if (!["cash", "transfer", "pos"].includes(mode)) return { ok: false, message: "Choose how the customer paid." };
  if (!moneyPoint) return { ok: false, message: "Choose where the money went." };
  const { error } = await supabase.rpc("confirm_order_payment", { _order: orderId, _mode: mode, _money_point: moneyPoint, _note: note.trim().slice(0, 200) });
  if (error) return { ok: false, message: friendlyError(error.message) };
  refresh(orderId);
  revalidatePath("/staff/walkin");
  revalidatePath("/staff/dispatch");
  return { ok: true, message: "Payment recorded. The order can now be released or delivered." };
}
