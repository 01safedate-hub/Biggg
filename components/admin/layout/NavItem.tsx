import Link from 'next/link';

export default function NavItem({ href, icon, label }: { href?: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href ?? '#'} legacyBehavior>
      <a className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-[12.5px] font-medium text-left transition-all" style={{color: '#B8B0A8'}}>
        <span>{icon}</span>
        {label}
      </a>
    </Link>
  );
}
