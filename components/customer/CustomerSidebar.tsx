import Link from "next/link";

const items = [
  { href: "/services", label: "Services" },
  { href: "/orders", label: "My orders" },
  { href: "/subscriptions", label: "Monthly plans" },
  { href: "/request", label: "Book a pickup" },
  { href: "/account/extra-clothes", label: "Extra-clothes bills" },
  { href: "/account", label: "My account" },
];

export function CustomerSidebar() {
  return (
    <div className="mb-6 space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
        <Link href="/" className="text-base font-bold text-ink">LaundryPoint</Link>
        <div className="flex items-center gap-2">
          <Link href="/account" className="rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-canvas">My account</Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Log out</button>
          </form>
        </div>
      </header>
      <aside aria-label="Customer sidebar" className="rounded-xl border border-line bg-white p-3">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">Customer menu</p>
        <nav aria-label="Customer navigation">
          <ul className="flex flex-wrap gap-1 md:flex-col">
            {items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-orange-50">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </div>
  );
}
