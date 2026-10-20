import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** Cookie-free client for public reads (plans, settings, zones) so pages stay cacheable. */
export function createPublicClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
