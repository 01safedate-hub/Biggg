import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { RetryButton } from "@/components/admin/OpsForms";

export const metadata = { title: "Email delivery" };

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { supabase } = await requireRole(["super_admin"]);
  let q = supabase.from("email_outbox").select("id,to_email,template,status,attempts,last_error,created_at,sent_at").order("created_at", { ascending: false }).limit(100);
  if (status && ["queued", "sending", "sent", "failed"].includes(status)) q = q.eq("status", status);
  const [{ data }, { data: all }] = await Promise.all([q, supabase.from("email_outbox").select("status").limit(2000)]);
  const count = (s: string) => (all ?? []).filter((r) => r.status === s).length;
  const chip = (href: string, label: string, on: boolean) => <Link href={href} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-brand bg-brand-tint text-brand-dark" : "border-line"}`}>{label}</Link>;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Email delivery</h1><p className="mt-1 text-sm text-ink-soft">Order updates and confirmations sent to customers. A failed email can be sent again once the cause is fixed (for example, the domain was not verified yet).</p></div>
      <div className="flex flex-wrap gap-2">
        {chip("/admin/emails", "All", !status)}
        {(["queued", "sent", "failed"] as const).map((s) => chip(`/admin/emails?status=${s}`, `${s} (${count(s)})`, status === s))}
      </div>
      <section className="card divide-y divide-line">
        {(data ?? []).map((e) => (
          <div key={e.id} className="space-y-1 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{e.template} <span className="font-normal text-ink-soft">to {e.to_email}</span></p>
              <p className={`text-xs ${e.status === "sent" ? "text-emerald-700" : e.status === "failed" ? "text-red-700" : "text-amber-700"}`}>{e.status} · {when(e.sent_at ?? e.created_at ?? "")}</p></div>
            {e.status === "failed" && <div className="flex flex-wrap items-center justify-between gap-2"><p className="break-words text-xs text-red-700">{e.last_error ?? "No error recorded"} (after {e.attempts} tries)</p><RetryButton id={e.id} /></div>}
          </div>
        ))}
        {(data ?? []).length === 0 && <p className="p-5 text-sm text-ink-soft">No emails yet.</p>}
      </section>
    </div>
  );
}
