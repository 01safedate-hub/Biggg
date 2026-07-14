'use client';

import useSWR from 'swr';
import { useEffect, useState } from 'react';
import getBrowserSupabase from '../lib/supabase/client';

export default function useSession() {
  const supabase = getBrowserSupabase();

  const { data: user, error, mutate } = useSWR('supabase-session', async () => {
    // Use getUser() instead of getSession() to ensure the user is validated
    const { data, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    return data.user ?? null;
  });

  const [profile, setProfile] = useState<any | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        if (!user) {
          setProfile(null);
          setIsAdmin(false);
          return;
        }

        const { data: profData, error: profErr } = await supabase
          .from('profiles')
          .select('id, role, full_name, phone, status, state, lga, created_at')
          .eq('id', user.id)
          .single();

        if (profErr && (profErr as any).code !== 'PGRST116') {
          // surface real errors, ignore simple not-found
          throw profErr;
        }

        const { data: adminData } = await supabase.rpc('is_admin');

        if (!mounted) return;

        setProfile(profData ?? null);
        setIsAdmin(!!adminData);
      } catch (e) {
        console.error('useSession error', e);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      // Revalidate SWR key and reload profile/role
      mutate();
      load();
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [user, mutate, supabase]);

  return { user: user ?? null, profile, isAdmin, loading, error };
}
