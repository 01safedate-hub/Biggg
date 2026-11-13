import { requireRole } from "@/lib/roles";
import { CLEANING_MONEY } from "@/lib/cleaning-roles";
import { INVOICE_PURPOSE_LABEL, dateTimeLabel, nairaK } from "@/lib/cleaning";
import { DeskPay } from "@/components/cleaning/StaffRequestTools";

export const metadata = { title: "Cleaning bills" };
export const dynamic = "force-dynamic";

type Inv = { id: string; purpose: string; amount_kobo: number; description: string; created_at: string; customer: string; phone: string | null };

export default async function CleaningInvoices({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireRole(CLEANING_MONEY);
  const [{ data, error }, { data: pts }] = await Promise.all([
    supabase.rpc("cleaning_open_invoices" as never, { _q: (sp.q ?? "").slice(0, 60) || null } as never),
    supabase.from("money_points").select("id,name,kind").eq("active", true).neq("kind", "online").order("name"),
  ]);
  const rows = (data ?? []) as unknown as Inv[];
  const points = (pts ?? []) as { id: string; name: string }[];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cleaning bills</h1>
        <p className="mt-1 text-sm text-ink-soft">Unpaid cleaning bills. Customers normally pay online. Record a payment here only once the money is in our account or cash is in hand. Booking bills hold a day for 30 minutes; if the hold has passed, check the board before confirming.</p>
      </div>
      <form method="get" className="flex gap-2"><input name="q" defaultValue={sp.q ?? ""} placeholder="Customer name or phone" className="flex-1 rounded-md border border-line px-3 py-2 text-sm" /><button className="btn-secondary">Search</button></form>
      {error && <p className="card p-4 text-sm text-red-700">Could not load bills.</p>}
      {!error && rows.length === 0 && <p className="card p-5 text-sm text-ink-soft">No unpaid cleaning bills.</p>}
      {rows.map((i) => (
        <div key={i.id} className="card space-y-2 p-4">
          <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{i.customer} {i.phone ? <span className="font-normal text-ink-soft">· {i.phone}</span> : null}</p><p className="font-bold">{nairaK(i.amount_kobo)}</p></div>
          <p className="text-sm text-ink-soft">{INVOICE_PURPOSE_LABEL[i.purpose] ?? i.purpose} · {i.description}</p>
          <p className="text-xs text-ink-mute">{dateTimeLabel(i.created_at)}</p>
          <DeskPay invoiceId={i.id} amountKobo={i.amount_kobo} points={points} back="/staff/cleaning/invoices" />
        </div>
      ))}
    </div>
  );
}
