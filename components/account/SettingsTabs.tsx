import Link from "next/link";

const TABS = [
  { href: "/account", label: "Profile" },
  { href: "/account/security", label: "Password and email" },
  { href: "/account/history", label: "History" },
  { href: "/account/partner", label: "Partner with us" },
] as const;

/** Tab bar shared by every customer Settings page. */
export function SettingsTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line pb-px">
        {TABS.map((t) => {
          const active = t.href === current;
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium ${active ? "border-brand text-brand-dark" : "border-transparent text-ink-soft hover:text-ink"}`}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
