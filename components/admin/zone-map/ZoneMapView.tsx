'use client';

import dynamic from 'next/dynamic';
import TopZonesPanel from './TopZonesPanel';
import LiveRidersPanel from './LiveRidersPanel';
import useRiderFeed from '@/hooks/useRiderFeed';

const ZoneMap = dynamic(() => import('./ZoneMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-[9px] text-[12px]" style={{ height: 460, background: 'var(--peach)', color: 'var(--gray)' }}>
      Loading map…
    </div>
  ),
});

export default function ZoneMapView({ zones = [], loading = false, error }: any) {
  // Use rider feed for realtime updates; fallback to zones.liveRiders
  const ridersRealtime = useRiderFeed();
  const riders = ridersRealtime ?? zones?.liveRiders ?? [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Zone Map
        </h1>
        <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--gray)' }}>
          Restaurant and rider density across Anambra State
        </p>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: '1fr 300px' }}>
        <div className="rounded-xl p-3.5" style={{ background: 'white', border: '1px solid var(--line)' }}>
          <ZoneMap zones={zones} riders={riders} />
        </div>
        <div className="flex flex-col gap-3.5">
          <TopZonesPanel zones={zones} />
          <LiveRidersPanel riders={riders} />
        </div>
      </div>
    </div>
  );
}
