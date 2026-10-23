import { requireRole } from "@/lib/roles";
import { CampaignForm } from "@/components/customers/CampaignForm";
import { SEGMENTS } from "@/lib/customers";

export const metadata = { title: "New campaign" };

export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ segment?: string }> }) {
  const { segment } = await searchParams;
  const { supabase } = await requireRole(["super_admin"]);
  const { data: promos } = await supabase.from("promo_codes").select("id,code,percent,expires_at").eq("active", true).order("created_at", { ascending: false });
  const live = (promos ?? []).filter((p) => !p.expires_at || new Date(p.expires_at).getTime() > Date.now());
  const seg = SEGMENTS.some((s) => s.key === segment) ? segment! : "never_ordered";
  return <CampaignForm promos={live} init={{ id: null, name: "", subject: "", heading: "", body: "", ctaLabel: "", ctaUrl: "", segment: seg, promo: null, sent: false, recipients: 0 }} />;
}
