'use client';

import { useEffect, useState, useRef } from 'react';
import getBrowserSupabase from '@/lib/supabase/client';

// Subscribes to the riders table and returns an array of riders with {id, name, lat, lng, status, last_seen}
export default function useRiderFeed() {
  const supabase = getBrowserSupabase();
  const [riders, setRiders] = useState<any[] | null>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      try {
        const { data, error } = await supabase.from('riders').select('*');
        if (error) {
          console.error('useRiderFeed initial load error', error);
          return;
        }
        if (!mounted) return;
        setRiders(data ?? []);
      } catch (err) {
        console.error('useRiderFeed load error', err);
      }
    }

    loadInitial();

    try {
      // Supabase v2 realtime subscription via channel
      // Listen for all changes on the 'riders' table
      const ch = supabase.channel('public:riders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'riders' }, (payload: any) => {
          const e = payload.eventType || payload.event || payload.type;
          const row = payload.new ?? payload.record ?? payload;
          if (!row) return;

          setRiders((prev) => {
            const list = (prev ?? []).slice();
            if (e === 'INSERT') {
              list.push(row);
            } else if (e === 'UPDATE') {
              const idx = list.findIndex((r: any) => r.id === row.id);
              if (idx >= 0) list[idx] = { ...list[idx], ...row };
              else list.push(row);
            } else if (e === 'DELETE') {
              return list.filter((r: any) => r.id !== row.id);
            }
            return list;
          });
        })
        .subscribe();

      channelRef.current = ch;
    } catch (err) {
      console.error('useRiderFeed subscribe error', err);
    }

    return () => {
      mounted = false;
      if (channelRef.current) {
        try { channelRef.current.unsubscribe(); } catch (e) { /* ignore */ }
      }
    };
  }, [supabase]);

  return riders;
}
