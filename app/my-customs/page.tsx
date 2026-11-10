import Link from "next/link";
import { requireUser } from "@/lib/roles";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { KIND_LABEL, MODE_LABEL } from "@/lib/customs";

export const metadata = { title: "My customs" };
export const dynamic = "force-dynamic";

type Row = { id: string; name: string; kind: string; mode: string; period: string | null; status: string; role: "manager" | "member"; tag: string | null; to_confirm: number };

export default async function MyCustoms() {
  const { supabase } = await requireUser("/my-customs");
  const { data } = await supabase.rpc("my_customs");
  const rows = (data ?? []) as unknown as Row[];
  return (
    <main id="main" className="min-h-screen">
      <CustomerSidebar />
      <div className="container-page mx-auto max-w-3xl space-y-6 pb-10 pt-4 sm:pt-6">
        <div><h1 className="text-3xl font-bold tracking-tight">My customs</h1><p className="mt-1 text-sm text-ink-soft">Lodges and businesses you belong to on LaundryPoint.</p></div>
        <section className="card divide-y divide-line">
          {rows.map((c) => (
            <Link key={c.id} href={`/my-customs/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-canvas">
              <div><p className="font-medium">{c.name}</p><p className="text-sm text-ink-soft">{KIND_LABEL[c.kind]} · {c.mode === "plan" ? `${c.period === "weekly" ? "Weekly" : "Monthly"} plan` : MODE_LABEL[c.mode]} · {c.role === "manager" ? "You are the manager" : `Your tag: ${c.tag ?? "—"}`}</p></div>
              {c.to_confirm > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">{c.to_confirm} to confirm</span>}
            </Link>
          ))}
          {rows.length === 0 && <p className="p-5 text-sm text-ink-soft">You are not part of any custom. If your lodge or business uses LaundryPoint, ask the manager to add your phone number.</p>}
        </section>
      </div>
    </main>
  );
}
