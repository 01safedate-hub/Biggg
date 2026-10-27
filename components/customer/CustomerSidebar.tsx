import Link from "next/link";

const items = [
  { href: "/services", label: "Services" },
  { href: "/orders", label: "My orders" },
  { href: "/subscriptions", label: "Monthly plans" },
  { href: "/request", label: "Book a pickup" },
  { href: "/account/extra-clothes", label: "Extra-clothes bills" },
];

export function CustomerSidebar() {
  return (
    <nav aria-label="Customer navigation" className="mb-6 rounded-xl border border-border bg-white p-3">
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="inline-block rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-orange-50">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
