import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { SEGMENTS, dt } from "@/lib/customers";

export const metadata = { title: "Email campaigns" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const { supabase } = await requireRole(["super_admin"]);
  const [{ data }, { data: promos }] = await Promise.all([
    supabase.from("campaigns").select("id,name,subject,segment,status,recipients,sent_at,created_at,promo_code_id").order("created_at", { ascending: false }),
    supabase.from("promo_codes").select("id,code"),
  ]);
  const code = new Map((promos ?? []).map((p) => [p.id, p.code]));
  const seg = new Map(SEGMENTS.map((s) => [s.key, s.label]));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-sm text-ink-soft">Send a branded email to a group of customers, with an optional discount code. Only customers who agreed to offers are emailed, and every email has an unsubscribe link.</p><Link href="/admin/customers/campaigns/new" className="btn-primary">New campaign</Link></div>
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead><tr className="border-b border-line bg-canvas text-ink-mute"><th className="px-4 py-3 font-medium">Campaign</th><th className="px-3 py-3 font-medium">Group</th><th className="px-3 py-3 font-medium">Code</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Sent to</th></tr></thead>
          <tbody>
            {(data ?? []).map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0 hover:bg-canvas/60">
                <td className="px-4 py-3"><Link href={`/admin/customers/campaigns/${c.id}`} className="font-medium text-brand-dark hover:underline">{c.name}</Link><p className="text-xs text-ink-mute">{c.subject}</p></td>
                <td className="px-3 py-3">{seg.get(c.segment) ?? c.segment}</td>
                <td className="px-3 py-3 font-mono">{c.promo_code_id ? code.get(c.promo_code_id) : "–"}</td>
                <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c.status === "sent" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{c.status === "sent" ? `Sent ${dt(c.sent_at)}` : "Draft"}</span></td>
                <td className="px-3 py-3 tabular-nums">{c.status === "sent" ? c.recipients : "–"}</td>
              </tr>
            ))}
            {(data ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-soft">No campaigns yet. Start with a template for people who signed up but never ordered.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
