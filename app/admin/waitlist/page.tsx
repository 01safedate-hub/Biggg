import { requireRole } from "@/lib/roles";
import { longDate } from "@/lib/money";

export const metadata = { title: "Waitlist" };

export default async function WaitlistPage() {
  const { supabase } = await requireRole(["super_admin", "admin"]);
  const { data, count } = await supabase.from("waitlist").select("id,email,detected_area,created_at,notified_at", { count: "exact" }).order("created_at", { ascending: false }).limit(500);
  const byArea = new Map<string, number>();
  for (const w of data ?? []) byArea.set(w.detected_area || "Unknown area", (byArea.get(w.detected_area || "Unknown area") ?? 0) + 1);
  const areas = Array.from(byArea.entries()).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Waitlist</h1>
        <p className="mt-1 text-sm text-ink-soft">People outside the areas you serve who asked to be told when you arrive. {count ?? 0} in total. Use the areas to decide where to open next.</p></div>
      {areas.length > 0 && (
        <section className="card p-5"><h2 className="text-lg font-semibold">Where they are</h2>
          <ul className="mt-3 space-y-2 text-sm">{areas.map(([a, n]) => <li key={a} className="flex justify-between"><span>{a}</span><span className="font-medium tabular-nums">{n}</span></li>)}</ul></section>
      )}
      <section className="card divide-y divide-line">
        {(data ?? []).map((w) => <div key={w.id} className="flex flex-wrap justify-between gap-2 p-4 text-sm"><span>{w.email}</span><span className="text-ink-mute">{w.detected_area || "Unknown area"} · {longDate(w.created_at ?? "")}{w.notified_at ? " · told" : ""}</span></div>)}
        {(data ?? []).length === 0 && <p className="p-4 text-sm text-ink-soft">Nobody has joined yet.</p>}
      </section>
    </div>
  );
}
