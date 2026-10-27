"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell as BellIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function Bell() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const refresh = async () => {
      const { count, error } = await supabase.from("user_notifications").select("id", { count: "exact", head: true }).is("read_at", null);
      if (active && !error) setN(count ?? 0);
    };
    void refresh();
    const channel = supabase.channel("nav-unread-notifications").on("postgres_changes", { event: "*", schema: "public", table: "user_notifications" }, () => { void refresh(); }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, []);
  return (
    <Link href="/notifications" className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-white hover:bg-canvas" aria-label={n ? `${n} unread messages` : "Messages"}>
      <BellIcon className="h-5 w-5" aria-hidden />
      {n > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-brand px-1.5 text-center text-xs font-bold leading-5 text-white">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}
