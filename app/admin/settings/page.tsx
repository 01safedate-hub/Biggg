import { requireRole } from "@/lib/roles";
import { SettingsForm } from "@/components/admin/SettingsForm";

export const metadata = { title: "Settings" };

type S = Record<string, Record<string, unknown>>;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const naira = (k: unknown) => (typeof k === "number" ? String(k / 100) : "");

export default async function SettingsPage() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.from("settings").select("key,value");
  const s: S = Object.fromEntries((data ?? []).map((r) => [r.key, (r.value ?? {}) as Record<string, unknown>]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-soft">The details that change how the website and the team behave. Every change is recorded.</p>
      </div>
      <SettingsForm v={{
        phone: str(s.contact?.phone), whatsapp: str(s.whatsapp?.number), hubAddress: str(s.hub?.address), hubLat: str(s.hub?.lat), hubLng: str(s.hub?.lng),
        demFeeNaira: naira(s.demurrage?.fee_kobo), demGraceHours: str(s.demurrage?.grace_hours ?? 48), demBasis: str(s.demurrage?.basis ?? "per_day"),
        targetNaira: naira(s.targets?.monthly_net_kobo), recoveryBasis: str(s.recovery?.basis ?? "profit"),
        paystackEnabled: str(s.payment_providers?.paystack_enabled ?? true), flutterwaveEnabled: str(s.payment_providers?.flutterwave_enabled ?? true),
      }} />
    </div>
  );
}
