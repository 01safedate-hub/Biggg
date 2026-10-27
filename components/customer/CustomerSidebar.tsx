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
    <div className="mb-6 grid gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
      <aside aria-label="Customer menu" className="rounded-xl border border-line bg-white p-3">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">My LaundryPoint</p>
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
        <form action="/auth/signout" method="post" className="mt-3 border-t border-line pt-3">
          <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50">Log out</button>
        </form>
      </aside>
      <div className="min-w-0 rounded-xl border border-line bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-sm font-semibold text-ink">LaundryPoint</Link>
          <div className="flex flex-wrap gap-2">
            <Link href="/account" className="rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-canvas">Account</Link>
            <form action="/auth/signout" method="post"><button type="submit" className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Log out</button></form>
          </div>
        </div>
      </div>
    </div>
  );
}
