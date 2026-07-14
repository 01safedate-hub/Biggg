export default function PageHeader({ title, subtitle, pill }: { title: string; subtitle?: string; pill?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start mb-5">
      <div>
        <h1 className="text-[20px] font-semibold" style={{fontFamily: "'Space Grotesk', sans-serif"}}>{title}</h1>
        {subtitle && <p className="text-[11.5px] mt-0.5" style={{color: 'var(--gray)'}}>{subtitle}</p>}
      </div>
      {pill ? <div>{pill}</div> : null}
    </div>
  );
}
