"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { InstallApp } from "@/components/brand/InstallApp";
import { CustomerNavBell } from "@/components/notifications/CustomerNavBell";
import { Bell } from "@/components/notifications/Bell";
import {
  Banknote, BarChart3, ClipboardList, Coins, FileClock, Gauge, Home, Landmark, LayoutDashboard, ListChecks, Menu, PiggyBank,
  Receipt, Settings, WashingMachine, Shield, Tags, Target, UserCog, Users, Wallet, X, MailPlus, PackageCheck, Send, Truck, Workflow, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  home: Home, overview: LayoutDashboard, money: Banknote, expenses: Receipt, costs: PiggyBank, staff: Users, settings: Settings,
  weekly: Target, points: Landmark, categories: Tags, prices: ListChecks, customers: UserCog, audit: FileClock, waitlist: MailPlus,
  jobs: Truck, dispatch: Send, receiving: PackageCheck, hub: WashingMachine, orders: Workflow, count: Coins, spending: Wallet, record: ClipboardList, admin: Shield, pay: Gauge, reports: BarChart3,
};

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS | string; exact?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

function Links({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const path = usePathname();
  const active = (i: NavItem) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/"));
  return (
    <nav aria-label="Main" className="space-y-6">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-widest text-ink-mute">{g.label}</p>
          <ul className="mt-2 space-y-0.5">
            {g.items.map((i) => {
              const Icon = ICONS[i.icon] ?? Home;
              const on = active(i);
              return (
                <li key={i.href}>
                  <Link href={i.href} onClick={onNavigate} aria-current={on ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${on ? "bg-brand-tint text-brand-dark" : "text-ink-soft hover:bg-canvas hover:text-ink"}`}>
                    <Icon aria-hidden className={`h-4 w-4 shrink-0 ${on ? "text-brand" : "text-ink-mute"}`} />
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ title, name, groups, showNotifications = false }: { title: string; name: string; groups: NavGroup[]; showNotifications?: boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const brand = (
    <Link href="/" className="flex items-center gap-2 px-3 font-bold tracking-tight">
      <Logo size={32} />
      <span>LaundryPoint</span>
    </Link>
  );
  const footer = (
    <div className="border-t border-line p-3">
      <p className="truncate px-3 text-sm font-medium">{name || "Signed in"}</p>
      <p className="px-3 text-xs text-ink-mute">{title}</p>
      <div className="mt-2 flex gap-1 text-sm">
        <Link href="/account" className="rounded-md px-3 py-1.5 font-medium text-ink-soft hover:bg-canvas hover:text-ink">Account</Link>
        <InstallApp />
        <form action="/auth/signout" method="post"><button className="rounded-md px-3 py-1.5 font-medium text-ink-soft hover:bg-canvas hover:text-ink">Sign out</button></form>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-white lg:flex">
        <div className="flex h-16 items-center">{brand}</div>
        <div className="flex-1 overflow-y-auto px-3 pb-6 pt-2"><Links groups={groups} /></div>
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
        {brand}
        <div className="flex items-center gap-2"><Bell /><div className="flex shrink-0 items-center gap-2">{showNotifications ? <CustomerNavBell /> : null}<button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="rounded-md p-2 text-ink-soft hover:bg-canvas"><Menu className="h-5 w-5" /></button></div></div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between pr-2">{brand}
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-md p-2 text-ink-soft hover:bg-canvas"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-6 pt-2"><Links groups={groups} onNavigate={() => setOpen(false)} /></div>
            {footer}
          </div>
        </div>
      )}
    </>
  );
}
