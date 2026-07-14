'use client';

import KpiGrid from '@/components/admin/dashboard/KpiGrid';
import OrdersChart from '@/components/admin/dashboard/OrdersChart';
import RevenueChart from '@/components/admin/dashboard/RevenueChart';
import ZoneChart from '@/components/admin/dashboard/ZoneChart';
import CancelChart from '@/components/admin/dashboard/CancelChart';

export default function DashboardView({ data, loading, error }: any) {
  // data === { kpis, trend, cancellation, zones }
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold" style={{fontFamily: "'Space Grotesk', sans-serif"}}>Dashboard</h1>
        <p className="text-[11.5px] mt-0.5" style={{color: 'var(--gray)'}}>Platform performance across all zones</p>
      </div>

      <KpiGrid kpis={data?.kpis ?? []} loading={loading} />

      <div className="grid gap-3.5 mb-3.5" style={{gridTemplateColumns: '1.4fr 1fr'}}>
        <div className="rounded-xl p-4" style={{background: 'white', border: '1px solid var(--line)'}}>
          <p className="text-[12.5px] font-semibold">Order volume — last 14 days</p>
          <p className="text-[10.5px] mb-3.5" style={{color: 'var(--gray)'}}>Across all active zones</p>
          <OrdersChart data={data?.trend} />
        </div>
        <div className="rounded-xl p-4" style={{background: 'white', border: '1px solid var(--line)'}}>
          <p className="text-[12.5px] font-semibold">Revenue breakdown</p>
          <p className="text-[10.5px] mb-3.5" style={{color: 'var(--gray)'}}>This month, by stream</p>
          <RevenueChart data={data?.revenue} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <div className="rounded-xl p-4" style={{background: 'white', border: '1px solid var(--line)'}}>
          <p className="text-[12.5px] font-semibold">Orders by zone</p>
          <p className="text-[10.5px] mb-3.5" style={{color: 'var(--gray)'}}>Today</p>
          <ZoneChart data={data?.zones} />
        </div>
        <div className="rounded-xl p-4" style={{background: 'white', border: '1px solid var(--line)'}}>
          <p className="text-[12.5px] font-semibold">Rider cancellation rate</p>
          <p className="text-[10.5px] mb-3.5" style={{color: 'var(--gray)'}}>Last 8 weeks</p>
          <CancelChart data={data?.cancellation} />
        </div>
      </div>
    </div>
  );
}
