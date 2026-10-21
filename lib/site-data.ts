import { createPublicClient } from "@/lib/supabase/public";
import type { Database } from "@/types/database";

type PlanRow = Database["public"]["Tables"]["plans"]["Row"];
type ZoneRow = { name: string; kind: string; is_live: boolean };

export type PublicSettings = {
  business: { name: string; timezone: string; opening_time: string; closing_time: string };
  agent: { eta_minutes: number };
  hub: { maps_url: string | null; address: string | null };
  whatsapp: { number: string | null };
  contact: { phone: string | null };
  subscription: { pickups_per_month: number; yearly_discount_pct: number };
};

const FALLBACK: PublicSettings = {
  business: { name: "LaundryPoint", timezone: "Africa/Lagos", opening_time: "08:00", closing_time: "18:00" },
  agent: { eta_minutes: 30 },
  hub: { maps_url: null, address: null },
  whatsapp: { number: null },
  contact: { phone: null },
  subscription: { pickups_per_month: 4, yearly_discount_pct: 10 },
};

export async function getSiteData() {
  const empty = { settings: FALLBACK, plans: [] as PlanRow[], zones: [] as ZoneRow[] };
  // Without configuration (or if Supabase is unreachable) render the page with safe defaults
  // instead of failing the build. The page revalidates and fills in live data later.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn("Supabase environment variables are not set; rendering with defaults.");
    return empty;
  }
  try {
    const db = createPublicClient();
    const [settings, plans, zones] = await Promise.all([
      db.from("settings").select("key,value").eq("is_public", true),
      db.from("plans").select("*").eq("active", true).order("sort_order"),
      db.from("zones").select("name,kind,is_live").eq("kind", "area").eq("is_live", true).order("name"),
    ]);

    const merged: Record<string, unknown> = { ...FALLBACK };
    for (const row of settings.data ?? []) {
      merged[row.key] = { ...(FALLBACK as Record<string, object>)[row.key], ...(row.value as object) };
    }
    return { settings: merged as PublicSettings, plans: plans.data ?? [], zones: zones.data ?? [] };
  } catch (err) {
    console.warn("Could not load site data; rendering with defaults.", err);
    return empty;
  }
}
