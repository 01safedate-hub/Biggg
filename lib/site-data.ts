import { createPublicClient } from "@/lib/supabase/public";

export type PublicSettings = {
  business: { name: string; timezone: string; opening_time: string; closing_time: string };
  agent: { eta_minutes: number };
  hub: { maps_url: string | null; address: string | null };
  whatsapp: { number: string | null };
  subscription: { pickups_per_month: number; yearly_discount_pct: number };
};

const FALLBACK: PublicSettings = {
  business: { name: "LaundryPoint", timezone: "Africa/Lagos", opening_time: "08:00", closing_time: "18:00" },
  agent: { eta_minutes: 30 },
  hub: { maps_url: null, address: null },
  whatsapp: { number: null },
  subscription: { pickups_per_month: 4, yearly_discount_pct: 10 },
};

export async function getSiteData() {
  const db = createPublicClient();
  const [settings, plans, zones] = await Promise.all([
    db.from("settings").select("key,value").eq("is_public", true),
    db.from("plans").select("*").eq("active", true).order("sort_order"),
    db.from("zones").select("name,kind,is_live").eq("kind", "area").eq("is_live", true).order("name"),
  ]);

  const merged: Record<string, unknown> = { ...FALLBACK };
  for (const row of settings.data ?? []) merged[row.key] = { ...(FALLBACK as Record<string, object>)[row.key], ...(row.value as object) };

  return {
    settings: merged as PublicSettings,
    plans: plans.data ?? [],
    zones: zones.data ?? [],
  };
}
