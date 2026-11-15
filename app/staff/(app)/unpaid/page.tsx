import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/orders";
import { PhoneActions } from "@/components/ops/PhoneActions";
import { listUnpaid, type UnpaidRow } from "@/lib/pay-later";

export const metadata = { title: "Unpaid orders" };
export const dynamic = "force-dynamic";

export default async function UnpaidPage() {
  const { supabase, roles } = await requireRole(["cashier", "secretary", "admin", "super_admin"]);
  const deskView = roles.some((r) => ["secretary", "admin", "super_admin"].includes(r));
  const rows = await listUnpaid(supabase);
  const claims = rows.filter((r) => r.claim);
  const later = rows.filter((r) => !r.claim);
  const total = rows.reduce((a, r) => a + r.amount_kobo, 0);
  const days = (since: string | null) => since ? Math.floor((Date.now() - new Date(since).getTime()) / 86400000) : 0;
  const href = (r: UnpaidRow) => deskView ? `/staff/walkin/${r.id}` : `/staff/orders/${r.id}`;
  const row = (r: UnpaidRow) => {
    const d = days(r.since);
    return (
      <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <Link href={href(r)} className="font-medium hover:underline">#{r.order_no} · {r.customer ?? "Customer"}</Link>
          <p className="text-sm text-ink-soft"><PhoneActions phone={r.phone} message={`Hello ${(r.customer ?? "").split(" ")[0]}, a reminder that ${naira(r.amount_kobo)} is still due for your LaundryPoint order #${r.order_no}. Your clothes are released once it is paid. Thank you.`} /> · {r.quick ? "Quick order" : "Walk-in"} · {STATUS_LABEL[r.status] ?? r.status}{r.no_email ? " · no email" : ""}</p>
          <p className="text-sm">{r.claim ? <>Agent says transferred{r.claim.sender ? <> from <strong>{r.claim.sender}</strong></> : null}</> : r.reason}{r.taken_by ? <span className="text-ink-soft"> · by {r.taken_by}</span> : null}</p>
        </div>
        <Link href={href(r)} className="text-right text-sm">
          <p className="text-lg font-bold">{naira(r.amount_kobo)}</p>
          <p className={d >= 3 ? "font-semibold text-red-700" : "text-ink-soft"}>{d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"}`}</p>
        </Link>
      </div>
    );
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Unpaid orders</h1>
        <p className="mt-1 text-sm text-ink-soft">Walk-in and quick orders marked pay later. These clothes can be washed but are never handed over or delivered until paid. Total owed: <strong>{naira(total)}</strong>.</p>
      </div>
      <section>
        <h2 className="mb-1 text-lg font-semibold">Transfers to check ({claims.length})</h2>
        <p className="mb-2 text-sm text-ink-soft">An agent says the customer transferred. Look for the money in the bank app, then open the order and confirm it.</p>
        <div className="card divide-y divide-line">{claims.map(row)}{claims.length === 0 && <p className="p-5 text-sm text-ink-soft">Nothing to check.</p>}</div>
      </section>
      <section>
        <h2 className="mb-1 text-lg font-semibold">Pay later ({later.length})</h2>
        <p className="mb-2 text-sm text-ink-soft">Customers with an email get reminders on day 1 and day 3. Call or WhatsApp the others.</p>
        <div className="card divide-y divide-line">{later.map(row)}{later.length === 0 && <p className="p-5 text-sm text-ink-soft">No one owes us.</p>}</div>
      </section>
    </div>
  );
}
