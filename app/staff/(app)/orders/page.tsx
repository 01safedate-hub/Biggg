import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { OrdersList } from "@/components/ops/OrdersList";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function StaffOrders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status, q } = await searchParams;
  const { supabase } = await requireRole(["super_admin", "admin", "secretary", "cashier"]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-ink-soft">Search any order by number, shelf, or the customer&rsquo;s name, phone or email. Open one for the full details. <Link href="/staff/shelves" className="font-medium underline">Shelf map</Link></p>
      </div>
      <OrdersList supabase={supabase} basePath="/staff/orders" status={status} term={q} />
    </div>
  );
}
