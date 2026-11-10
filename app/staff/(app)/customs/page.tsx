import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { naira } from "@/lib/format";
import { KIND_LABEL, MODE_LABEL } from "@/lib/customs";
import { CreateCustomForm } from "@/components/customs/StaffCustoms";

export const metadata = { title: "Customs" };
export const dynamic = "force-dynamic";

type Row = { id: string; name: string; code: string; kind: string; mode: string; status: string; period: string | null; period_end: string | null; manager: string | null; balance_kobo: number; members: number; open_batches: number };

export default async function CustomsPage() {
  const { supabase } = await requireRole(["cashier", "secretary", "admin", "super_admin"]);
  const { data } = await supabase.rpc("customs_list");
  const rows = (data ?? []) as unknown as Row[];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customs</h1>
        <p className="mt-1 text-sm text-ink-soft">Businesses and student lodges with their own rates. Every custom is prepaid: record a deposit before taking clothes in.</p>
      </div>
      <section className="card divide-y divide-line" aria-label="All customs">
        {rows.map((c) => (
          <Link key={c.id} href={`/staff/customs/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-canvas">
            <div>
              <p className="font-medium">{c.name} <span className="text-xs text-ink-mute">{c.code}</span></p>
              <p className="text-sm text-ink-soft">{KIND_LABEL[c.kind]} · {MODE_LABEL[c.mode]}{c.period ? ` (${c.period})` : ""} · {c.members} member{c.members === 1 ? "" : "s"} · manager {c.manager ?? "—"}{c.status !== "active" ? ` · ${c.status}` : ""}</p>
            </div>
            <div className="text-right text-sm">
              <p className={`font-semibold ${c.balance_kobo <= 0 ? "text-red-700" : ""}`}>{naira(c.balance_kobo)}</p>
              {c.open_batches > 0 && <p className="text-ink-soft">{c.open_batches} open batch{c.open_batches === 1 ? "" : "es"}</p>}
            </div>
          </Link>
        ))}
        {rows.length === 0 && <p className="p-5 text-sm text-ink-soft">No customs yet. Create the first one below.</p>}
      </section>
      <CreateCustomForm />
    </div>
  );
}
