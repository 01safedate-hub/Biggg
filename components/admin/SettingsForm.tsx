"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/rpc-errors";
import { toKobo } from "@/lib/money";
import { inputCls, labelCls } from "./ui";

export type SettingsValues = {
  phone: string; whatsapp: string; hubAddress: string; hubLat: string; hubLng: string;
  demFeeNaira: string; demGraceHours: string; demBasis: string; targetNaira: string; recoveryBasis: string; paystackEnabled: string; flutterwaveEnabled: string;
};

export function SettingsForm({ v }: { v: SettingsValues }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const fee = toKobo(s("fee"));
    if (!fee) return setMsg({ ok: false, text: "Enter the storage fee in naira, for example 3000." });
    const grace = Number(s("grace"));
    if (!Number.isInteger(grace) || grace < 0 || grace > 720) return setMsg({ ok: false, text: "Grace period must be a whole number of hours, 0 to 720." });
    let target: string | null = null;
    if (s("target")) {
      const k = toKobo(s("target"));
      if (!k) return setMsg({ ok: false, text: "Enter the monthly target in naira, or leave it empty." });
      target = String(k);
    }
    if ((s("lat") === "") !== (s("lng") === "")) return setMsg({ ok: false, text: "Enter both latitude and longitude, or leave both empty." });
    const num = (x: string) => (x === "" ? null : Number(x));
    if ((s("lat") && Number.isNaN(Number(s("lat")))) || (s("lng") && Number.isNaN(Number(s("lng"))))) return setMsg({ ok: false, text: "Latitude and longitude must be numbers." });

    setBusy(true);
    const { error } = await createClient().rpc("save_business_settings", {
      _patch: {
        contact_phone: s("phone"), whatsapp_number: s("whatsapp"), hub_address: s("address"), hub_lat: num(s("lat")), hub_lng: num(s("lng")),
        demurrage_fee_kobo: fee, demurrage_grace_hours: grace, demurrage_basis: s("basis"), monthly_net_target_kobo: target,\n        paystack_enabled: s("paystackEnabled") === "on", flutterwave_enabled: s("flutterwaveEnabled") === "on",
      },
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: friendlyError(error.message) });
    setMsg({ ok: true, text: "Saved. The website picks up phone, WhatsApp and location changes within a few minutes." });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">How customers reach you</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="phone" className={labelCls}>Contact phone</label><input id="phone" name="phone" type="tel" defaultValue={v.phone} className={inputCls} /><p className="mt-1 text-xs text-ink-mute">Shown on the website. Leave empty to hide it.</p></div>
          <div><label htmlFor="whatsapp" className={labelCls}>WhatsApp number</label><input id="whatsapp" name="whatsapp" type="tel" defaultValue={v.whatsapp} className={inputCls} /><p className="mt-1 text-xs text-ink-mute">Include the country code, for example 2348031234567.</p></div>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">Store location</h2>
        <div><label htmlFor="address" className={labelCls}>Address</label><input id="address" name="address" defaultValue={v.hubAddress} maxLength={200} className={inputCls} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="lat" className={labelCls}>Latitude</label><input id="lat" name="lat" inputMode="decimal" defaultValue={v.hubLat} className={inputCls} /></div>
          <div><label htmlFor="lng" className={labelCls}>Longitude</label><input id="lng" name="lng" inputMode="decimal" defaultValue={v.hubLng} className={inputCls} /></div>
        </div>
        <p className="text-xs text-ink-mute">In Google Maps, press and hold on the store, then copy the two numbers shown. The &ldquo;Open in Google Maps&rdquo; link is built from them. Staff check-in distance is measured from this point.</p>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">Uncollected orders (demurrage)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label htmlFor="fee" className={labelCls}>Fee, naira</label><input id="fee" name="fee" inputMode="decimal" defaultValue={v.demFeeNaira} className={inputCls} /></div>
          <div><label htmlFor="basis" className={labelCls}>Charged</label><select id="basis" name="basis" defaultValue={v.demBasis} className={inputCls}><option value="per_day">Per day after the free period</option><option value="flat">Once after the free period</option></select></div>
          <div><label htmlFor="grace" className={labelCls}>Free period, hours</label><input id="grace" name="grace" inputMode="numeric" defaultValue={v.demGraceHours} className={inputCls} /></div>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">Targets and recovery</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="target" className={labelCls}>Monthly target (sales minus approved expenses), naira</label><input id="target" name="target" inputMode="decimal" defaultValue={v.targetNaira} className={inputCls} /><p className="mt-1 text-xs text-ink-mute">Staff only ever see this as a percentage. Leave empty for none.</p></div>
          <div><p className={labelCls}>Start-up costs are recovered from</p><p className="mt-1 rounded-md border border-line bg-canvas px-3 py-2.5 text-sm text-ink-soft">Profit only (sales minus approved expenses)</p></div>
        </div>
      </section>

      <button className="btn-primary" disabled={busy}>{busy ? "Saving" : "Save settings"}</button>
    </form>
  );
}
