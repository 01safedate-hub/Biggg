"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell as BellIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function CustomerNavBell() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const load = async () => {
      const { count: unread, error } = await supabase.from("user_notifications").select("id", { count: "exact", head: true }).is("read_at", null);
      if (active && !error) setCount(unread ?? 0);
    };
    void load();
    const channel = supabase.channel("customer-nav-notifications").on("postgres_changes", { event: "*", schema: "public", table: "user_notifications" }, () => void load()).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, []);
  return <Link href="/notifications" aria-label={count ? String(count) + " unread notifications" : "Notifications"} className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-white hover:bg-canvas">
    <BellIcon className="h-5 w-5" aria-hidden />
    {count > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-brand px-1.5 text-center text-xs font-bold leading-5 text-white">{count > 99 ? "99+" : count}</span>}
  </Link>;
}
