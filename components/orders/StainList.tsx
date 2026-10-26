import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { StainAck } from "./StainAck";

/** Hard stains noticed on an order, with their photos. The customer can tap "Noted" to acknowledge. */
export async function StainList({ supabase, orderId, canAck = false }: { supabase: SupabaseClient<Database>; orderId: string; canAck?: boolean }) {
  const { data } = await supabase.from("order_photos").select("id,storage_path,note,acknowledged_at,created_at").eq("order_id", orderId).eq("kind", "stain").order("created_at");
  const rows = data ?? [];
  if (rows.length === 0) return null;
  const { data: signed } = await supabase.storage.from("order-photos").createSignedUrls(rows.map((r) => r.storage_path), 600);
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return (
    <section aria-label="Hard stains" className="card space-y-3 border-amber-300 p-5">
      <div>
        <h2 className="text-lg font-semibold">Hard stains noticed</h2>
        <p className="text-sm text-ink-soft">We will do our best to remove these, but some stains cannot come out fully.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 rounded-lg border border-line p-3 text-sm">
            {url.get(r.storage_path) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={url.get(r.storage_path) ?? ""} alt={r.note || "Hard stain"} className="h-40 w-full rounded-md object-cover" loading="lazy" />}
            <p>{r.note || "Hard stain"}</p>
            {canAck && !r.acknowledged_at && <StainAck photoId={r.id} orderId={orderId} />}
            {r.acknowledged_at && <p className="text-xs text-emerald-700">Noted by the customer</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
