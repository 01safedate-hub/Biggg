import {createServerClient, type CookieOptions} from '@supabase/ssr';
import type {SupabaseClient} from '@supabase/supabase-js';

type CookieAccessor = {
  getAll: () => Array<{name: string; value: string}>;
  setAll: (cookies: Array<{name: string; value: string; options?: CookieOptions}>) => void;
};

export function createServerSupabase(opts: {cookies: CookieAccessor}): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, anon, {
    cookies: {
      getAll: opts.cookies.getAll,
      setAll: opts.cookies.setAll,
    },
  });
}
