import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { CampaignForm } from "@/components/customers/CampaignForm";

export const metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

export default async function EditCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole(["super_admin"]);
  const [{ data: c }, { data: promos }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", id).maybeSingle(),
    supabase.from("promo_codes").select("id,code,percent,expires_at,active"),
  ]);
  if (!c) notFound();
  const live = (promos ?? []).filter((p) => p.id === c.promo_code_id || (p.active && (!p.expires_at || new Date(p.expires_at).getTime() > Date.now())));
  return <CampaignForm promos={live} init={{ id: c.id, name: c.name, subject: c.subject, heading: c.heading, body: c.body, ctaLabel: c.cta_label ?? "", ctaUrl: c.cta_url ?? "", segment: c.segment, promo: c.promo_code_id, sent: c.status === "sent", recipients: c.recipients }} />;
}
