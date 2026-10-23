import { requireRole } from "@/lib/roles";
import { PromoCreate, PromoToggle } from "@/components/customers/PromoForms";
import { dt } from "@/lib/customers";

export const metadata = { title: "Discount codes" };
export const dynamic = "force-dynamic";

export default async function PromosPage() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.from("promo_codes").select("id,code,percent,max_uses,uses,expires_at,active,note,created_at").order("created_at", { ascending: false });
  const now = Date.now();
  return (
    <div className="space-y-6">
      <PromoCreate />
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead><tr className="border-b border-line bg-canvas text-ink-mute"><th className="px-4 py-3 font-medium">Code</th><th className="px-3 py-3 font-medium">Discount</th><th className="px-3 py-3 font-medium">Used</th><th className="px-3 py-3 font-medium">Valid until</th><th className="px-3 py-3 font-medium">State</th><th className="px-3 py-3" /></tr></thead>
          <tbody>
            {(data ?? []).map((p) => {
              const expired = p.expires_at != null && new Date(p.expires_at).getTime() < now;
              const used = p.max_uses != null && p.uses >= p.max_uses;
              const state = !p.active ? "Off" : expired ? "Expired" : used ? "Used up" : "Live";
              return (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3"><span className="font-mono font-semibold">{p.code}</span>{p.note && <p className="text-xs text-ink-mute">{p.note}</p>}</td>
                  <td className="px-3 py-3 font-semibold">{p.percent}% off</td>
                  <td className="px-3 py-3 tabular-nums">{p.uses}{p.max_uses != null ? ` of ${p.max_uses}` : ""}</td>
                  <td className="px-3 py-3">{p.expires_at ? dt(p.expires_at) : "No end date"}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${state === "Live" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{state}</span></td>
                  <td className="px-3 py-3 text-right"><PromoToggle id={p.id} active={p.active} /></td>
                </tr>
              );
            })}
            {(data ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-soft">No codes yet. Create one above, then attach it to an email campaign.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
