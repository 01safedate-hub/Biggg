'use client';

import { useState } from 'react';
import getBrowserSupabase from '@/lib/supabase/client';
import { mutate } from 'swr';

export default function useAdminAction() {
  const supabase = getBrowserSupabase();
  const [loadingIds, setLoadingIds] = useState<string[]>([]);

  function start(id: string) {
    setLoadingIds((s) => (s.includes(id) ? s : [...s, id]));
  }
  function done(id: string) {
    setLoadingIds((s) => s.filter((x) => x !== id));
  }

  async function approveRestaurant(id: string) {
    start(id);
    const key = 'admin-query:restaurants';

    // optimistic update
    mutate(key, (current: any) => {
      if (!current) return current;
      return current.map((r: any) => (r.id === id ? { ...r, status: 'active' } : r));
    }, false);

    const { error } = await supabase.from('restaurants').update({ status: 'active' }).eq('id', id);
    if (error) {
      // rollback by revalidating
      await mutate(key);
      done(id);
      throw error;
    }

    await mutate(key);
    done(id);
  }

  async function rejectRestaurant(id: string) {
    start(id);
    const key = 'admin-query:restaurants';

    mutate(key, (current: any) => {
      if (!current) return current;
      return current.map((r: any) => (r.id === id ? { ...r, status: 'rejected' } : r));
    }, false);

    const { error } = await supabase.from('restaurants').update({ status: 'rejected' }).eq('id', id);
    if (error) {
      await mutate(key);
      done(id);
      throw error;
    }

    await mutate(key);
    done(id);
  }

  return { approveRestaurant, rejectRestaurant, loadingIds };
}
