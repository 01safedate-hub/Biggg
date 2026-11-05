import Link from "next/link";
import { requireRole } from "@/lib/roles";

export const metadata = { title: "Agent verification" };
export const dynamic = "force-dynamic";

type Application = {
  id: string;
  applicant_user_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  status: string;
  applied_at: string | null;
  created_at: string;
};

const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium" }).format(new Date(value))
  : "—";

export default async function AgentVerificationQueue() {
  const { supabase } = await requireRole(["secretary", "admin", "super_admin"]);
  const { data, error } = await (supabase as any)
    .from("agent_applications")
    .select("id,applicant_user_id,full_name,email,phone,status,applied_at,created_at")
    .in("status", ["applied", "hub_verified"])
    .not("applicant_user_id", "is", null)
    .order("applied_at", { ascending: true })
    .limit(100);
  const applications = (data ?? []) as Application[];

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Commission-agent hub verification</h1>
        <p className="mt-1 text-sm text-ink-soft">Check the applicant in person at the LaundryPoint hub. Compare their original NIN document with their submitted details and confirm their face matches their application photo. Final activation remains with the super admin.</p>
      </header>
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">The verification queue could not be loaded. Refresh and try again.</p>}
      <section className="card divide-y divide-line overflow-hidden">
        {applications.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">{a.full_name}</p>
              <p className="text-sm text-ink-soft">{a.email} · {a.phone}</p>
              <p className="mt-1 text-xs capitalize text-ink-mute">{a.status.replaceAll("_", " ")} · Applied {date(a.applied_at)}</p>
            </div>
            <Link className="btn-secondary" href={`/staff/agent-verification/${a.applicant_user_id}`}>Open verification</Link>
          </div>
        ))}
        {!error && applications.length === 0 && <p className="p-5 text-sm text-ink-soft">No commission-agent applications are waiting for hub verification.</p>}
      </section>
    </main>
  );
}
