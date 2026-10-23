import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/roles";
import { naira } from "@/lib/format";
import { longDate } from "@/lib/money";
import { PrintButton } from "@/components/orders/PrintButton";

export const metadata = { title: "Receipt" };
export const dynamic = "force-dynamic";

const PURPOSE: Record<string, string> = { pickup_fare: "Transport (pickup + delivery)", delivery_fare: "Delivery fare", items: "Clothes bill", demurrage: "Storage fee" };

export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/orders/${id}/receipt`);
  const { data: o } = await supabase.from("orders").select("*").eq("id", id).eq("customer_id", user.id).maybeSingle();
  if (!o) notFound();
  const [{ data: lines }, { data: pays }, { data: me }] = await Promise.all([
    supabase.from("order_items").select("id,name,qty,unit_price_kobo,line_total_kobo").eq("order_id", id).is("removed_at", null).order("created_at"),
    supabase.from("payments").select("id,purpose,kind,mode,amount_kobo,reference,status,paid_at").eq("order_id", id).eq("customer_id", user.id).eq("status", "success").order("paid_at"),
    supabase.from("profiles").select("full_name,phone").eq("id", user.id).maybeSingle(),
  ]);
  const paid = (pays ?? []).reduce((s, p) => s + (p.kind === "refund" ? -p.amount_kobo : p.amount_kobo), 0);
  return (
    <main id="main" className="container-page max-w-2xl space-y-6 py-10">
      <div className="flex items-center justify-between print:hidden"><Link href={`/orders/${id}`} className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Back to order</Link><PrintButton /></div>
      <div><h1 className="text-3xl font-bold tracking-tight">Receipt · Order #{o.order_no}</h1><p className="mt-1 text-ink-soft">{me?.full_name} · {longDate(o.created_at ?? "")}</p>{o.pickup_address && <p className="text-sm text-ink-soft">{o.pickup_address}</p>}</div>
      {(lines ?? []).length > 0 && (
        <section className="card p-5"><h2 className="text-lg font-semibold">Clothes</h2>
          <table className="mt-3 w-full text-sm"><tbody className="divide-y divide-line">{(lines ?? []).map((l) => <tr key={l.id}><td className="py-2">{l.qty} × {l.name}</td><td className="py-2 text-right">{naira(l.line_total_kobo ?? 0)}</td></tr>)}</tbody>
            <tfoot>{o.discount_kobo > 0 && <tr className="text-emerald-700"><td className="pt-3">Discount</td><td className="pt-3 text-right">-{naira(o.discount_kobo)}</td></tr>}<tr className="font-semibold"><td className="pt-3">Clothes total</td><td className="pt-3 text-right">{naira(Math.max(0, o.items_total_kobo - o.discount_kobo))}</td></tr></tfoot></table>
        </section>
      )}
      <section className="card p-5"><h2 className="text-lg font-semibold">Payments</h2>
        <table className="mt-3 w-full text-sm"><tbody className="divide-y divide-line">
          {(pays ?? []).map((p) => <tr key={p.id}><td className="py-2">{p.kind === "refund" ? "Refund: " : ""}{PURPOSE[p.purpose] ?? p.purpose}<span className="block text-xs text-ink-mute">{p.paid_at ? longDate(p.paid_at) : ""} · {p.reference}</span></td><td className="py-2 text-right">{p.kind === "refund" ? "-" : ""}{naira(p.amount_kobo)}</td></tr>)}
          {(pays ?? []).length === 0 && <tr><td className="py-2 text-ink-soft">No payments yet.</td><td /></tr>}
        </tbody><tfoot><tr className="font-semibold"><td className="pt-3">Total paid</td><td className="pt-3 text-right">{naira(paid)}</td></tr></tfoot></table>
      </section>
      <p className="text-xs text-ink-mute">Thank you for choosing LaundryPoint. Keep this receipt for your records.</p>
    </main>
  );
}
