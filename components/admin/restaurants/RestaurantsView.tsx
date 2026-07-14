'use client';

import ApprovalQueueTable from './ApprovalQueueTable';

export default function RestaurantsView({ restaurants = [], loading = false }: any) {
  const pending = (restaurants || []).filter((r: any) => r.status === 'pending');
  const active = (restaurants || []).filter((r: any) => r.status !== 'pending');

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold" style={{fontFamily: "'Space Grotesk', sans-serif"}}>Restaurants</h1>
        <p className="text-[11.5px] mt-0.5" style={{color: 'var(--gray)'}}>Manage restaurant onboarding and approvals</p>
      </div>

      <div className="grid gap-3.5" style={{gridTemplateColumns: '1fr 360px'}}>
        <div className="rounded-xl p-3.5" style={{background: 'white', border: '1px solid var(--line)'}}>
          <p className="text-[12.5px] font-semibold mb-3">Approval queue</p>
          <ApprovalQueueTable items={pending} loading={loading} />
        </div>

        <div className="rounded-xl p-3.5" style={{background: 'white', border: '1px solid var(--line)'}}>
          <p className="text-[12.5px] font-semibold mb-3">Active restaurants</p>
          <div className="space-y-3 max-h-[420px] overflow-auto">
            {active.length === 0 && <div className="text-[13px] text-[var(--gray)]">No active restaurants</div>}
            {active.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-[11px]" style={{color: 'var(--gray)'}}>{r.zone ?? '—'}</div>
                </div>
                <div className="text-[13px]" style={{color: 'var(--gray)'}}>{r.orders_today ?? 0} orders</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
