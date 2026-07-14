export default function KpiGrid({ kpis = [], loading = false }: any) {
  return (
    <div className="grid grid-cols-5 gap-3 mb-5">
      {kpis.map((k: any) => (
        <div key={k.label} className="rounded-xl p-3.5" style={{background: 'white', border: '1px solid var(--line)'}}>
          <p className="text-[10.5px] uppercase tracking-wide mb-2" style={{color: 'var(--gray)'}}>{k.label}</p>
          <p className="text-[21px] font-bold mb-1.5" style={{fontFamily: "'Space Grotesk', sans-serif"}}>{k.value}</p>
          <p className="text-[10.5px] font-semibold" style={{color: k.up ? '#1E9E5A' : '#C1453A'}}>{k.trend}</p>
        </div>
      ))}
    </div>
  );
}
