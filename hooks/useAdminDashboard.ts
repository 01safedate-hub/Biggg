'use client';

import useSWR from 'swr';
import getBrowserSupabase from '@/lib/supabase/client';

export default function useAdminDashboard() {
  const supabase = getBrowserSupabase();

  const { data, error, mutate, isValidating } = useSWR('admin-dashboard', async () => {
    const res = await supabase.functions.invoke('admin-dashboard');
    if ((res as any).error) throw (res as any).error;
    return (res as any).data;
  });

  return { data, error, mutate, loading: !data && !error, isValidating };
}
