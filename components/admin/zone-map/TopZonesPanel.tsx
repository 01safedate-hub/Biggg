'use client';

export default function TopZonesPanel({ zones = [] }: any) {
  return (
    <div className="rounded-xl p-3.5" style={{background: 'white', border: '1px solid var(--line)'}}>
      <p className="text-[12.5px] font-semibold mb-2">Top zones</p>
      <div className="space-y-2">
        {(zones || []).slice(0,5).map((z: any, i: number) => (
          <div key={z.id ?? i} className="flex justify-between items-center text-[13px]">
            <div>
              <div className="font-medium">{z.name ?? `Zone ${i+1}`}</div>
              <div className="text-[11px]" style={{color: 'var(--gray)'}}>{z.active_restaurants ?? 0} restaurants</div>
            </div>
            <div className="text-[14px] font-semibold">{z.orders_today ?? 0}</div>
          </div>
        ))}
        {(zones || []).length === 0 && <div className="text-[13px] text-[var(--gray)]">No zone data available</div>}
      </div>
    </div>
  );
}
