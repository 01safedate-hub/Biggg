import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { HubVerificationPanel } from "@/components/admin/HubVerificationPanel";
import { AgentOrientationChecklist } from "@/components/admin/AgentOrientationChecklist";

export const metadata = { title: "Verify commission agent" };
export const dynamic = "force-dynamic";

type Detail = {
  application: { id: string; full_name: string; email: string; phone: string; status: string; applied_at: string | null };
  profile: { nin: string | null; photo_path: string | null; home_address: string | null; date_of_birth: string | null; referee_name: string | null; referee_phone: string | null; referee_address: string | null; referee_relationship: string | null } | null;
  latest_hub_check: { outcome: string; person_present: boolean; nin_document_checked: boolean; nin_matches_profile: boolean; photo_matches_person: boolean; referee_checked: boolean; notes: string | null; verified_at: string } | null;
  orientation: { bags_and_receiving_at: string | null; arrival_and_delivery_codes_at: string | null; counting_and_stain_photos_at: string | null; no_cash_app_payments_at: string | null; commission_rules_at: string | null } | null;
};

export default async function VerifyAgent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { data, error } = await supabase.rpc("secretary_agent_verification_detail", { _user: id });
  if (error || !data) notFound();
  const d = data as unknown as Detail;
  let photoUrl: string | null = null;
  if (d.profile?.photo_path) {
    const { data: signed } = await supabase.storage.from("staff-docs").createSignedUrl(d.profile.photo_path, 600);
    photoUrl = signed?.signedUrl ?? null;
  }

  return (
    <main className="space-y-6">
      <Link href="/staff/agent-verification" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Verification queue</Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{d.application.full_name}</h1>
        <p className="mt-1 text-sm text-ink-soft">{d.application.email} · {d.application.phone}</p>
        <p className="mt-1 text-xs capitalize text-ink-mute">Application status: {d.application.status.replaceAll("_", " ")}</p>
      </header>
      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Application identity details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-xs text-ink-mute">Submitted NIN</p><p className="font-semibold tabular-nums">{d.profile?.nin ?? "Not supplied"}</p></div>
          <div><p className="text-xs text-ink-mute">Date of birth</p><p>{d.profile?.date_of_birth ?? "—"}</p></div>
          <div className="sm:col-span-2"><p className="text-xs text-ink-mute">Home address</p><p>{d.profile?.home_address ?? "—"}</p></div>
          <div><p className="text-xs text-ink-mute">Referee</p><p>{d.profile?.referee_name ?? "—"} · {d.profile?.referee_relationship ?? "—"}</p><p className="text-sm text-ink-soft">{d.profile?.referee_phone ?? ""}</p></div>
          <div><p className="text-xs text-ink-mute">Referee address</p><p>{d.profile?.referee_address ?? "—"}</p></div>
        </div>
        <div>
          <p className="mb-2 text-xs text-ink-mute">Applicant's submitted face photo</p>
          {photoUrl ? <img src={photoUrl} alt="Applicant submitted face photo" className="h-40 w-40 rounded-lg border border-line object-cover" /> : <p className="text-sm text-ink-soft">Photo is unavailable. Ask the applicant to update their onboarding photo before verifying.</p>}
        </div>
        <p className="text-xs text-ink-mute">Handle NIN information privately. Do not copy the full NIN into verification notes or messages.</p>
      </section>
      <AgentOrientationChecklist userId={id} record={d.orientation} />
      <HubVerificationPanel userId={id} record={d.latest_hub_check ? { ...d.latest_hub_check, hub_location: "LaundryPoint hub" } : null} />
      <p className="text-sm text-ink-soft">A successful secretary check only advances the application. A super admin must still review and approve the staff profile before the agent becomes active.</p>
    </main>
  );
}
