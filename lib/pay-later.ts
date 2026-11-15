// Server-side helpers for pay-later orders. The amount owed always comes from the database (unpaid_orders),
// which counts unpaid items plus a quick order's unpaid delivery fee.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type UnpaidRow = {
  id: string; order_no: number; status: string; quick: boolean; source: string; amount_kobo: number; since: string | null;
  reason: string | null; claim: { sender?: string; amount_kobo?: number; at?: string } | null;
  customer: string | null; phone: string | null; no_email: boolean; taken_by: string | null;
};

export async function listUnpaid(supabase: SupabaseClient<Database>): Promise<UnpaidRow[]> {
  const { data, error } = await supabase.rpc("unpaid_orders");
  if (error || !Array.isArray(data)) return [];
  return data as unknown as UnpaidRow[];
}

// Everything the PayLaterPanel needs for one order, or null when nothing is owed.
export async function payLaterFor(supabase: SupabaseClient<Database>, orderId: string) {
  const rows = await listUnpaid(supabase);
  const row = rows.find((r) => r.id === orderId);
  if (!row) return null;
  const [{ data: pts }, { data: bank }] = await Promise.all([
    supabase.from("money_points").select("id,name").eq("active", true).neq("kind", "online").order("name"),
    supabase.rpc("pay_later_bank"),
  ]);
  return { row, points: (pts ?? []).map((p) => ({ id: p.id, name: p.name })), defaultPoint: ((bank ?? {}) as { money_point_id?: string | null }).money_point_id ?? null };
}
