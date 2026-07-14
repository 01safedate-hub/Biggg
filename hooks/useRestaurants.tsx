'use client';

import useSWR from 'swr';
import getBrowserSupabase from '@/lib/supabase/client';
import type {Restaurant} from '@/types/database';

export function useRestaurants(options?: {
  category?: string;
  zone?: string;
  promotedOnly?: boolean;
}) {
  const supabase = getBrowserSupabase();

  const {data, isLoading, error} = useSWR(
    ['restaurants', options?.category, options?.zone, options?.promotedOnly],
    async () => {
      let query = supabase
        .from('restaurants')
        .select('*')
        .order('rating', {ascending: false});

      if (options?.category && options.category !== 'All') {
        query = query.eq('category', options.category);
      }

      if (options?.zone) {
        query = query.eq('zone', options.zone);
      }

      if (options?.promotedOnly) {
        query = query.eq('is_promoted', true);
      }

      const {data, error} = await query;

      if (error) throw error;
      return data as Restaurant[];
    }
  );

  return {
    restaurants: data ?? [],
    isLoading,
    error,
  };
}

export function useRestaurant(slug: string) {
  const supabase = getBrowserSupabase();

  const {data, isLoading, error} = useSWR(
    ['restaurant', slug],
    async () => {
      const {data, error} = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) throw error;
      return data as Restaurant;
    }
  );

  return {
    restaurant: data,
    isLoading,
    error,
  };
}
