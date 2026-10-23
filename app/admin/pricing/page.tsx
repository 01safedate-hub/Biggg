import { requireRole } from "@/lib/roles";
import { PricingForm } from "@/components/admin/OpsForms";

export const metadata = { title: "Fares and hours" };

export default async function PricingPage() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.from("settings").select("key,value").in("key", ["fare_pickup", "fare_delivery", "business", "agent"]);
  const s = Object.fromEntries((data ?? []).map((r) => [r.key, r.value as Record<string, unknown>]));
  const num = (o: Record<string, unknown> | undefined, k: string) => Number(o?.[k] ?? 0);
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Fares and hours</h1><p className="mt-1 text-sm text-ink-soft">What customers pay for transport, when you are open, and how fast you promise to arrive. Changes apply to new bookings only.</p></div>
      <PricingForm v={{
        pickupRate: num(s.fare_pickup, "rate_per_km_kobo"), pickupMin: num(s.fare_pickup, "min_fare_kobo"),
        deliveryRate: num(s.fare_delivery, "rate_per_km_kobo"), deliveryMin: num(s.fare_delivery, "min_fare_kobo"),
        roundTo: num(s.fare_pickup, "round_to_kobo") || 5000, open: String(s.business?.opening_time ?? "08:00"), close: String(s.business?.closing_time ?? "18:00"), eta: num(s.agent, "eta_minutes") || 30,
      }} />
    </div>
  );
}
