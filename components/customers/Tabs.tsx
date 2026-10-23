"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/customers", label: "Overview", exact: true },
  { href: "/admin/customers/all", label: "All customers" },
  { href: "/admin/customers/map", label: "Map" },
  { href: "/admin/customers/campaigns", label: "Email campaigns" },
  { href: "/admin/customers/promos", label: "Discount codes" },
];

export function CustomerTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Customers section" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-line px-1">
        {TABS.map((t) => {
          const on = t.exact ? path === t.href : path === t.href || path.startsWith(t.href + "/");
          return <li key={t.href}><Link href={t.href} aria-current={on ? "page" : undefined} className={`-mb-px block border-b-2 px-4 py-2.5 text-sm font-medium ${on ? "border-brand text-brand-dark" : "border-transparent text-ink-soft hover:text-ink"}`}>{t.label}</Link></li>;
        })}
      </ul>
    </nav>
  );
}
