'use client';

export default function LiveRidersPanel({ riders = [] }: any) {
  return (
    <div className="rounded-xl p-3.5" style={{background: 'white', border: '1px solid var(--line)'}}>
      <p className="text-[12.5px] font-semibold mb-2">Live riders</p>
      <div className="space-y-2 max-h-[200px] overflow-auto">
        {(riders || []).slice(0,8).map((r: any, i: number) => (
          <div key={r.id ?? i} className="flex items-center gap-3 text-[13px]">
            <div className="w-8 h-8 rounded-full bg-[rgba(0,0,0,0.06)] flex items-center justify-center">{r.initials ?? 'RD'}</div>
            <div className="flex-1">
              <div className="font-medium">{r.name ?? `Rider ${i+1}`}</div>
              <div className="text-[11px]" style={{color: 'var(--gray)'}}>{r.status ?? 'available'}</div>
            </div>
            <div className="text-[11px]" style={{color: 'var(--gray)'}}>{r.distance ?? '—'}</div>
          </div>
        ))}
        {(riders || []).length === 0 && <div className="text-[13px] text-[var(--gray)]">No active riders</div>}
      </div>
    </div>
  );
}
