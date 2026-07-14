'use client';

export const dynamic = 'force-dynamic';

import RestaurantsView from '@/components/admin/restaurants/RestaurantsView';
import useAdminQuery from '@/hooks/useAdminQuery';

export default function RestaurantsPage() {
  const { data, loading, error } = useAdminQuery('restaurants');

  return <RestaurantsView restaurants={data ?? []} loading={loading} error={error} />;
}
