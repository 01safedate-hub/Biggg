import Link from "next/link";
import { requireRole } from "@/lib/roles";

export const metadata = { title: "Audit log" };

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const HIDE = new Set(["initial_pw_hash", "nin", "bank_account_number"]);

function changed(oldD: Record<string, unknown> | null, newD: Record<string, unknown> | null) {
  if (!newD) return oldD ? "Removed" : "";
  if (!oldD) return "Created";
  return Object.keys(newD).filter((k) => !HIDE.has(k) && k !== "updated_at" && JSON.stringify(newD[k]) !== JSON.stringify(oldD[k])).map((k) => `${k}: ${JSON.stringify(oldD[k] ?? null)} → ${JSON.stringify(newD[k])}`).join("; ") || "No visible change";
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const { table } = await searchParams;
  const { supabase } = await requireRole(["super_admin"]);
  let q = supabase.from("audit_log").select("id,actor_id,action,table_name,row_id,old_data,new_data,created_at").order("id", { ascending: false }).limit(200);
  if (table && /^[a-z_]+$/.test(table)) q = q.eq("table_name", table);
  const { data } = await q;
  const ids = Array.from(new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))) as string[];
  const { data: ppl } = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
  const who = new Map((ppl ?? []).map((p) => [p.id, p.full_name]));
  const tables = ["expenses", "payments", "capital_entries", "staff_profiles", "staff_pay", "user_roles", "profiles", "settings", "weekly_payouts", "unit_log", "items", "money_points"];
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-ink-soft">Who changed what, and when. Records cannot be edited or removed. Sensitive numbers (NIN, account numbers) are hidden here.</p></div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/audit" className={`rounded-full border px-3 py-1 ${!table ? "border-brand bg-brand-tint text-brand-dark" : "border-line"}`}>All</Link>
        {tables.map((t) => <Link key={t} href={`/admin/audit?table=${t}`} className={`rounded-full border px-3 py-1 ${table === t ? "border-brand bg-brand-tint text-brand-dark" : "border-line"}`}>{t}</Link>)}
      </div>
      <section className="card divide-y divide-line">
        {(data ?? []).map((r) => (
          <div key={r.id} className="p-4 text-sm">
            <p><span className="font-medium">{who.get(r.actor_id ?? "") ?? (r.actor_id ? "Staff" : "System")}</span> · {r.action.toLowerCase()} · <span className="font-mono text-xs">{r.table_name}</span> <span className="text-ink-mute">· {when(r.created_at ?? "")}</span></p>
            <p className="mt-1 break-words text-ink-soft">{changed(r.old_data as Record<string, unknown> | null, r.new_data as Record<string, unknown> | null)}</p>
          </div>
        ))}
        {(data ?? []).length === 0 && <p className="p-4 text-sm text-ink-soft">Nothing recorded for this filter.</p>}
      </section>
    </div>
  );
}
