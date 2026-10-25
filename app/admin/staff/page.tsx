import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { StaffInvite } from "@/components/admin/StaffInvite";
import { StaffRow } from "@/components/admin/StaffRow";
import type { StaffRowData } from "@/lib/staff";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const { supabase, user } = await requireRole(["super_admin"]);
  const { data, error } = await supabase.rpc("staff_list");
  const staff = (Array.isArray(data) ? data : []) as unknown as StaffRowData[];
  const { data: ob } = await supabase.rpc("staff_onboarding_status");
  const onboarding = (ob ?? {}) as unknown as Record<string, string>;

  const waiting = staff.filter((s) => onboarding[s.id] === "submitted");
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
        <p className="mt-1 text-sm text-ink-soft">Invite people, choose what they can do, and remove access when someone leaves. Every change is recorded.</p>
      </div>
      {waiting.length > 0 && (
        <section aria-label="Waiting for review" className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-950">{waiting.length} waiting for your review</h2>
          <p className="text-sm text-amber-900">These people have filled in their details. Open each one to check and approve, or send it back with a note.</p>
          <ul className="mt-2 space-y-1 text-sm">{waiting.map((s) => <li key={s.id}><Link className="font-medium text-brand-dark underline" href={`/admin/staff/${s.id}`}>{s.full_name || s.email}</Link></li>)}</ul>
        </section>
      )}
      <StaffInvite />
      <section aria-label="Team" className="space-y-3">
        <h2 className="text-lg font-semibold">Team ({staff.length})</h2>
        {error && <p role="alert" className="text-sm text-red-700">The team list could not be loaded. Please refresh.</p>}
        {staff.map((s) => <StaffRow key={s.id} s={s} isMe={s.id === user.id} onboarding={onboarding[s.id] ?? "incomplete"} />)}
      </section>
    </div>
  );
}
