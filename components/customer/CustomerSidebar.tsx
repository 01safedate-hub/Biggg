"use client";

import { Sidebar, type NavGroup } from "@/components/admin/Sidebar";

const GROUPS: NavGroup[] = [
  { label: "My LaundryPoint", items: [
    { href: "/services", label: "Services", icon: "overview", exact: true },
    { href: "/orders", label: "My orders", icon: "orders", exact: true },
    { href: "/subscriptions", label: "Monthly plans", icon: "weekly", exact: true },
    { href: "/request", label: "Book a pickup", icon: "dispatch", exact: true },
    { href: "/account/extra-clothes", label: "Extra-clothes bills", icon: "money", exact: true },
    { href: "/account", label: "My account", icon: "settings", exact: true },
  ] },
];

export function CustomerSidebar({ onboarding = false }: { onboarding?: boolean }) {
  const groups = onboarding
    ? [{ label: "Get started", items: [
        { href: "/services", label: "Services", icon: "overview", exact: true },
        { href: "/onboarding/location", label: "Check service area", icon: "home", exact: true },
        { href: "/subscriptions", label: "Monthly plans", icon: "weekly", exact: true },
      ] }]
    : GROUPS;
  return <Sidebar title="Customer" name="Customer account" groups={groups} />;
}
