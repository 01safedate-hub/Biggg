import Link from "next/link";
import { PhoneActions } from "@/components/ops/PhoneActions";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { DeskIssueActions } from "@/components/ops/DeskIssues";

export const metadata = { title: "Customer problems" };
export const dynamic = "force-dynamic";

type Row = { id: string; order_id: string; order_no: number; kind: string; description: string; customer: string; phone: string | null; at: string; items_paid_kobo: number; escalated_at: string | null; recommended_kobo: number; escalation_note: string | null };
const KIND: Record<string, string> = { missing_item: "Missing item", damaged: "Damaged", wrong_item: "Wrong item", not_clean: "Not clean", other: "Other" };
const dt = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function DeskIssues() {
  const { supabase, roles } = await requireRole(["secretary", "admin", "super_admin"]);
  const { data } = await supabase.rpc("desk_issues");
  const d = data as unknown as { limit_kobo: number; can_refund: boolean; issues: Row[] } | null;
  const superAdmin = roles.includes("super_admin");
  const rows = d?.issues ?? [];
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Customer problems</h1>
        <p className="mt-1 text-sm text-ink-soft">{superAdmin ? "Super admins answer these from Needs attention." : d?.can_refund ? `You can resolve these and refund up to ${naira(d.limit_kobo)}. Anything bigger goes up to the super admin.` : "Call the customer, find out what happened and answer. You cannot refund money: if one is deserved, send it up with the amount you suggest."}</p></div>
      <section className="space-y-3">
        {rows.map((i) => (
          <article key={i.id} className="card space-y-2 p-4">
            <p className="font-medium"><Link className="text-brand-dark underline" href={`/staff/orders/${i.order_id}`}>#{i.order_no}</Link> · {i.customer} · {KIND[i.kind] ?? i.kind} <span className="text-xs text-ink-mute">{dt(i.at)}</span></p>
            <p className="text-sm">{i.description}</p>
            {i.phone && <p className="text-sm"><PhoneActions phone={i.phone} /></p>}
            {i.escalated_at && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-950">Sent to the super admin {dt(i.escalated_at)}{i.recommended_kobo > 0 ? `, suggested refund ${naira(i.recommended_kobo)}` : ""}. {i.escalation_note}</p>}
            {!i.escalated_at && <DeskIssueActions id={i.id} canRefund={Boolean(d?.can_refund)} limitNaira={Math.floor((d?.limit_kobo ?? 0) / 100)} paidNaira={Math.floor(i.items_paid_kobo / 100)} suggested={0} />}
          </article>
        ))}
        {rows.length === 0 && <p className="card p-5 text-sm text-ink-soft">No open problems. Good.</p>}
      </section>
    </div>
  );
}
