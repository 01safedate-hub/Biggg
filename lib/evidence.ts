import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PHOTO_PROBLEM, compressImage, extFor } from "@/lib/compress-image";

export type EvidenceKind = "receipt" | "bank_debit" | "transfer_alert" | "invoice" | "other";
export type EvidenceItem = { id: string; file: File; kind: EvidenceKind };

export const MAX_FILES = 8;
export const MAX_BYTES = 10 * 1024 * 1024;
export const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const ALLOWED = new Set(ACCEPT.split(","));
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export function checkFile(f: File): string | null {
  if (!ALLOWED.has(f.type)) return `${f.name}: only photos (JPG, PNG, WebP) and PDF files are accepted.`;
  if (f.size > MAX_BYTES) return `${f.name}: file is larger than 10 MB.`;
  if (f.size === 0) return `${f.name}: file is empty.`;
  return null;
}

/** Uploads into the caller's own folder. Files are write-once; the database links them to a record. */
export async function uploadEvidence(supabase: SupabaseClient<Database>, userId: string, items: EvidenceItem[]) {
  const out: { path: string; kind: EvidenceKind }[] = [];
  for (const it of items) {
    // Photos are shrunk under 20 KB on the phone. PDFs are uploaded as they are.
    let body: Blob = it.file;
    let type = it.file.type;
    let ext = EXT[it.file.type];
    if (type !== "application/pdf") {
      try { body = await compressImage(it.file); } catch { throw new Error(`${it.file.name}: ${PHOTO_PROBLEM}`); }
      type = body.type; ext = extFor(body);
    }
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("expense-evidence").upload(path, body, { contentType: type, upsert: false });
    if (error) throw new Error(`Could not upload ${it.file.name}. Please check your connection and try again.`);
    out.push({ path, kind: it.kind });
  }
  return out;
}
