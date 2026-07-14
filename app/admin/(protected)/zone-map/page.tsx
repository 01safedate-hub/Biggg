'use client';

export const dynamic = 'force-dynamic';

import useAdminDashboard from '@/hooks/useAdminDashboard';
import ZoneMapView from '@/components/admin/zone-map/ZoneMapView';

export default function ZoneMapPage() {
  const { data, loading, error } = useAdminDashboard();
  // admin-dashboard returns zones in `zones`
  return <ZoneMapView zones={data?.zones} loading={loading} error={error} />;
}
