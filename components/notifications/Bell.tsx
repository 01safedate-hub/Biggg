import Link from "next/link";
import { Bell as BellIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/** Bell with the number of unread messages. Reads only the signed-in person's own rows. */
export async function Bell() {
  const supabase = await createClient();
  const { count } = await supabase.from("user_notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const n = count ?? 0;
  return (
    <Link href="/notifications" className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white hover:bg-canvas" aria-label={n ? `${n} unread messages` : "Messages"}>
      <BellIcon className="h-5 w-5" aria-hidden />
      {n > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-brand px-1.5 text-center text-xs font-bold leading-5 text-white">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}
