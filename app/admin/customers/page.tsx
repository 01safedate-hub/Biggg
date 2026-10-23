import { requireRole } from "@/lib/roles";
import { longDate } from "@/lib/money";
import { CustomerStatus } from "@/components/admin/CustomerRow";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase } = await requireRole(["super_admin"]);
  const [{ data: people }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id,full_name,email,phone,customer_code,status,status_reason,created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("user_roles").select("user_id"),
  ]);
  const staff = new Set((roles ?? []).map((r) => r.user_id));
  const term = (q ?? "").trim().toLowerCase();
  const rows = (people ?? []).filter((p) => !staff.has(p.id)).filter((p) => !term || [p.full_name, p.email, p.phone, p.customer_code].some((x) => (x ?? "").toLowerCase().includes(term)));
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-ink-soft">Restricting a customer stops them signing in and ordering. Their history stays. Staff are managed under Staff.</p></div>
      <form className="flex gap-2"><input name="q" defaultValue={q ?? ""} placeholder="Search name, email, phone or code" aria-label="Search customers" className="w-full max-w-sm rounded-md border border-line px-3 py-2 text-sm" /><button className="btn-secondary">Search</button></form>
      <section className="card divide-y divide-line">
        {rows.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-medium">{p.full_name || "No name"} <span className="text-xs font-normal text-ink-mute">{p.customer_code}</span></p>
              <p className="text-sm text-ink-soft">{p.email} {p.phone ? `· ${p.phone}` : ""} · joined {longDate(p.created_at)}</p>
              {p.status !== "active" && <p className="text-sm text-red-700">Restricted: {p.status_reason}</p>}</div>
            <CustomerStatus id={p.id} status={p.status} />
          </div>
        ))}
        {rows.length === 0 && <p className="p-4 text-sm text-ink-soft">{term ? "Nobody matches that search." : "No customers have signed up yet."}</p>}
      </section>
    </div>
  );
}
