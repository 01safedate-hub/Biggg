import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type Proof = { id: string; kind: string; url: string | null };

/** Short-lived links to private proof files, grouped by the record they belong to. */
export async function loadProofs(supabase: SupabaseClient<Database>, column: "expense_id" | "capital_id", ids: string[]) {
  const map = new Map<string, Proof[]>();
  if (ids.length === 0) return map;
  const { data: rows } = await supabase.from("evidence").select("id,kind,storage_path,expense_id,capital_id").in(column, ids).order("created_at");
  const paths = (rows ?? []).map((r) => r.storage_path);
  const { data: signed } = paths.length ? await supabase.storage.from("expense-evidence").createSignedUrls(paths, 600) : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  for (const r of rows ?? []) {
    const key = (column === "expense_id" ? r.expense_id : r.capital_id) as string;
    const list = map.get(key) ?? [];
    list.push({ id: r.id, kind: r.kind, url: urlByPath.get(r.storage_path) ?? null });
    map.set(key, list);
  }
  return map;
}
