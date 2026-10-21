import Link from "next/link";

export type NavItem = { href: string; label: string };

export function Shell({ title, name, nav, children }: { title: string; name: string; nav: NavItem[]; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span aria-hidden className="grid h-8 w-8 place-items-center rounded-md bg-brand text-sm text-white">L</span>
            <span className="hidden sm:inline">LaundryPoint</span>
            <span className="text-sm font-medium text-ink-mute">/ {title}</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-soft sm:inline">{name}</span>
            <Link href="/account" className="font-medium text-ink-soft hover:text-ink">Account</Link>
          </div>
        </div>
        <nav aria-label={`${title} sections`} className="container-page flex gap-1 overflow-x-auto pb-2">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-canvas hover:text-ink">{n.label}</Link>
          ))}
        </nav>
      </header>
      <main id="main" className="container-page py-8">{children}</main>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}
    </div>
  );
}
