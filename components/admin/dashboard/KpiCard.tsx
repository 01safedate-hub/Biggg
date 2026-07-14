export default function KpiCard({ label, value, trend, up }: any) {
  return (
    <div className="rounded-xl p-3.5" style={{background: 'white', border: '1px solid var(--line)'}}>
      <p className="text-[10.5px] uppercase tracking-wide mb-2" style={{color: 'var(--gray)'}}>{label}</p>
      <p className="text-[21px] font-bold mb-1.5" style={{fontFamily: "'Space Grotesk', sans-serif"}}>{value}</p>
      <p className="text-[10.5px] font-semibold" style={{color: up ? '#1E9E5A' : '#C1453A'}}>{trend}</p>
    </div>
  );
}
