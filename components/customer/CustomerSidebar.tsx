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

export function CustomerSidebar() {
  return <Sidebar title="Customer" name="Customer account" groups={GROUPS} />;
}
