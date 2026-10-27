"use client";

import { Sidebar, type NavGroup } from "@/components/admin/Sidebar";

const GROUPS: NavGroup[] = [
  { label: "My LaundryPoint", items: [
    { href: "/orders", label: "Dashboard", icon: "overview", exact: true },
    { href: "/services", label: "Services", icon: "hub", exact: true },
    { href: "/subscriptions", label: "Monthly plans", icon: "weekly", exact: true },
    { href: "/request", label: "Book a pickup", icon: "dispatch", exact: true },
    { href: "/account/extra-clothes", label: "Extra-clothes bills", icon: "money", exact: true },
    { href: "/account", label: "My account", icon: "settings", exact: true },
  ] },
];

export function CustomerSidebar({ onboarding = false, name = "Customer account" }: { onboarding?: boolean; name?: string }) {
  const groups = onboarding
    ? [{ label: "Get started", items: [
        { href: "/services", label: "Services", icon: "hub", exact: true },
        { href: "/onboarding/location", label: "Check service area", icon: "home", exact: true },
        { href: "/subscriptions", label: "Monthly plans", icon: "weekly", exact: true },
      ] }]
    : GROUPS;
  return <Sidebar title="Customer" name={name} groups={groups} showNotifications />;
}
