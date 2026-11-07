import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { PhoneActions } from "@/components/ops/PhoneActions";

export const metadata = { title: "Partner requests" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "New", cls: "bg-brand-tint text-brand-dark" },
  contacted: { label: "Contacted", cls: "bg-blue-50 text-blue-900" },
  invited: { label: "Invited as agent", cls: "bg-emerald-50 text-emerald-900" },
  declined: { label: "Declined", cls: "bg-slate-100 text-ink-soft" },
};
const when = (iso: string) => new Date(iso).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });

async function setStatus(formData: FormData) {
  "use server";
  const { supabase } = await requireRole(["super_admin"]);
  await supabase.rpc("set_partner_interest_status", { _id: String(formData.get("id") ?? ""), _status: String(formData.get("status") ?? "") });
  revalidatePath("/admin/partner-requests");
}

export default async function PartnerRequests() {
  const { supabase } = await requireRole(["super_admin"]);
  const { data } = await supabase.from("partner_interest").select("id,customer_id,message,status,created_at,handled_at").order("created_at", { ascending: false }).limit(200);
  const rows = data ?? [];
  const ids = Array.from(new Set(rows.map((r) => r.customer_id)));
  const { data: people } = ids.length ? await supabase.from("profiles").select("id,full_name,email,phone,customer_code").in("id", ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p]));
  const open = rows.filter((r) => r.status === "new").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Partner requests</h1>
        <p className="mt-1 text-sm text-ink-soft">Customers who tapped &quot;I&apos;m interested&quot; under Settings → Partner with us. Call them, then invite suitable people as commission agents from <Link href="/admin/staff" className="underline">Staff</Link>. {open ? `${open} new.` : "No new requests."}</p>
      </div>
      {rows.length === 0 && <p className="card p-5 text-sm text-ink-soft">No requests yet.</p>}
      <div className="space-y-3">
        {rows.map((r) => {
          const p = who.get(r.customer_id);
          const s = STATUS[r.status] ?? STATUS.new;
          return (
            <article key={r.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{p?.full_name ?? "Customer"} <span className="text-sm font-normal text-ink-soft">· {p?.customer_code}</span></p>
                  <p className="text-sm text-ink-soft">{p?.email} <PhoneActions phone={p?.phone} /></p>
                  <p className="text-xs text-ink-mute">Asked {when(r.created_at)}{r.handled_at ? ` · updated ${when(r.handled_at)}` : ""}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
              </div>
              {r.message && <p className="rounded-md bg-canvas p-3 text-sm">&ldquo;{r.message}&rdquo;</p>}
              <form action={setStatus} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={r.id} />
                {(["contacted", "invited", "declined"] as const).filter((x) => x !== r.status).map((x) => (
                  <button key={x} name="status" value={x} className="btn-secondary text-sm">Mark {STATUS[x].label.toLowerCase()}</button>
                ))}
              </form>
            </article>
          );
        })}
      </div>
    </div>
  );
}
