"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";
import { SEGMENTS } from "@/lib/customers";

type R = { ok: boolean; message: string };

export async function createPromoAction(v: { code: string; percent: number; maxUses: number | null; expires: string | null; note: string }): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("create_promo", { _code: v.code, _percent: v.percent, _max_uses: v.maxUses as number, _expires: (v.expires || null) as string, _note: v.note });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/customers/promos");
  return { ok: true, message: "Code created." };
}

export async function setPromoActive(id: string, active: boolean): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { error } = await supabase.rpc("set_promo_active", { _id: id, _active: active });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/customers/promos");
  return { ok: true, message: active ? "Code switched on." : "Code switched off." };
}

export type CampaignInput = { id: string | null; name: string; subject: string; heading: string; body: string; ctaLabel: string; ctaUrl: string; segment: string; promo: string | null };

export async function saveCampaignAction(v: CampaignInput): Promise<R & { id?: string }> {
  const { supabase } = await requireRole(["super_admin"]);
  if (!SEGMENTS.some((s) => s.key === v.segment)) return { ok: false, message: friendlyError("invalid_campaign") };
  const { data, error } = await supabase.rpc("save_campaign", {
    _id: v.id as string, _name: v.name, _subject: v.subject, _heading: v.heading, _body: v.body, _cta_label: v.ctaLabel, _cta_url: v.ctaUrl, _segment: v.segment, _promo: v.promo as string,
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/customers/campaigns");
  return { ok: true, message: "Saved.", id: String(data) };
}

export async function sendCampaignAction(id: string, test: boolean): Promise<R> {
  const { supabase } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.rpc("send_campaign", { _id: id, _test: test });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/customers/campaigns");
  const n = (data as { recipients?: number } | null)?.recipients;
  return { ok: true, message: test ? "A test email is on its way to your own address. It arrives within five minutes." : `Queued for ${n ?? 0} customer${n === 1 ? "" : "s"}. Emails go out in batches over the next few minutes.` };
}

export async function audienceAction(segment: string): Promise<{ total: number; eligible: number } | null> {
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.rpc("campaign_audience", { _segment: segment });
  return (data as { total: number; eligible: number } | null) ?? null;
}
