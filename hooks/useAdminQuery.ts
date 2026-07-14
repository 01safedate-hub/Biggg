'use client';

import useSWR from 'swr';
import getBrowserSupabase from '@/lib/supabase/client';

export default function useAdminQuery(table: string) {
  const supabase = getBrowserSupabase();
  const key = `admin-query:${table}`;

  const { data, error, mutate, isValidating } = useSWR(key, async () => {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    return data;
  });

  return { data, error, mutate, loading: !data && !error, isValidating };
}
