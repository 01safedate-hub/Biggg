import Link from "next/link";
import { requireUser } from "@/lib/roles";
import { markAllRead } from "./actions";

export const metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function NotificationsPage() {
  const { supabase, user } = await requireUser("/notifications");
  const [{ data }, { data: roles }] = await Promise.all([
    supabase.from("user_notifications").select("id,title,body,kind,order_id,read_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(60),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const staff = (roles ?? []).length > 0;
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  const href = (n: NonNullable<typeof data>[number]) => (!n.order_id ? null : n.kind === "job" ? `/staff/jobs/${n.order_id}` : staff ? null : `/orders/${n.order_id}`);
  return (
    <main id="main" className="container-page max-w-2xl space-y-6 py-10">
      <Link href={staff ? "/staff" : "/orders"} className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Back</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
        {unread > 0 && <form action={markAllRead}><button className="btn-secondary">Mark all as read</button></form>}
      </div>
      <section className="card divide-y divide-line">
        {(data ?? []).map((n) => {
          const to = href(n);
          const body = (
            <div className="flex items-start gap-3 p-4">
              <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-brand"}`} />
              <div className="min-w-0"><p className={n.read_at ? "text-ink-soft" : "font-semibold"}>{n.title}</p>{n.body && <p className="mt-0.5 text-sm text-ink-soft">{n.body}</p>}<p className="mt-1 text-xs text-ink-mute">{when(n.created_at ?? "")}</p></div>
            </div>
          );
          return to ? <Link key={n.id} href={to} className="block hover:bg-canvas">{body}</Link> : <div key={n.id}>{body}</div>;
        })}
        {(data ?? []).length === 0 && <p className="p-5 text-sm text-ink-soft">No messages yet. Updates about your orders appear here.</p>}
      </section>
    </main>
  );
}
