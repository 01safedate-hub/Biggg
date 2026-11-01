"use client";

import { useEffect, useState } from "react";
import { Sidebar, type NavGroup } from "@/components/admin/Sidebar";
import { createClient } from "@/lib/supabase/client";

const PLAN_ITEM = { href: "/subscriptions", label: "Monthly plans", icon: "weekly", exact: true };
const MANAGE_ITEM = { href: "/subscriptions/manage", label: "Manage subscription", icon: "weekly", exact: true };

const GROUPS: NavGroup[] = [
  { label: "My LaundryPoint", items: [
    { href: "/dashboard", label: "Dashboard", icon: "overview", exact: true },
    { href: "/orders", label: "My orders", icon: "dispatch", exact: true },
    PLAN_ITEM,
    { href: "/request", label: "Book a pickup", icon: "dispatch", exact: true },
    { href: "/account/extra-clothes", label: "Extra-clothes bills", icon: "money", exact: true },
    { href: "/account", label: "My account", icon: "settings", exact: true },
  ] },
];

export function CustomerSidebar({ onboarding = false, name = "Customer account" }: { onboarding?: boolean; name?: string }) {
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);

  useEffect(() => {
    if (onboarding) return;
    const supabase = createClient();
    let mounted = true;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("customer_id", user.id)
        .eq("status", "active")
        .limit(1);
      if (mounted) setHasActiveSubscription(Boolean(data?.length));
    });
    return () => { mounted = false; };
  }, [onboarding]);

  const groups = onboarding
    ? [{ label: "Get started", items: [
        { href: "/services", label: "Services", icon: "hub", exact: true },
        { href: "/onboarding/location", label: "Check service area", icon: "home", exact: true },
        PLAN_ITEM,
      ] }]
    : [{ label: "My LaundryPoint", items: [
        { href: "/dashboard", label: "Dashboard", icon: "overview", exact: true },
        { href: "/orders", label: "My orders", icon: "dispatch", exact: true },
        hasActiveSubscription ? MANAGE_ITEM : PLAN_ITEM,
        { href: "/request", label: "Book a pickup", icon: "dispatch", exact: true },
        { href: "/account/extra-clothes", label: "Extra-clothes bills", icon: "money", exact: true },
        { href: "/account", label: "My account", icon: "settings", exact: true },
      ] }];
  return <Sidebar title="Customer" name={name} groups={groups} showNotifications={false} />;
}
