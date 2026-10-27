import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FormMessage } from "@/components/auth/AuthShell";
import { ProfileForm } from "@/components/account/ProfileForm";
import { OffersToggle } from "@/components/account/OffersToggle";

export const metadata = { title: "My account" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin", admin: "Admin", secretary: "Secretary", cashier: "Cashier", delivery_agent: "Delivery agent",
};

const NOTICE: Record<string, string> = {
  confirmed: "Your email is confirmed. Welcome to LaundryPoint.",
  password_changed: "Your password was changed.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null; // middleware redirects signed-out visitors

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("full_name,phone,email,customer_code,status,marketing_opt_in").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const roleNames = (roles ?? []).map((r) => ROLE_LABEL[r.role] ?? r.role);
  const keys = (roles ?? []).map((r) => r.role as string);
  const isSuper = keys.includes("super_admin");
  const isMoneyStaff = isSuper || keys.some((k) => ["admin", "secretary", "cashier"].includes(k));
  const isStaff = isMoneyStaff || keys.includes("delivery_agent");

  return (
    <main id="main" className="container-page max-w-3xl py-12">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Home</Link>
        <form action="/auth/signout" method="post"><button className="btn-secondary">Sign out</button></form>
      </div>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">My account</h1>
      {notice && NOTICE[notice] && <div className="mt-4"><FormMessage kind="info">{NOTICE[notice]}</FormMessage></div>}
      {!isStaff && (
        <section className="card mt-6 space-y-3 p-6">
          <h2 className="text-lg font-semibold">Ready to do your laundry?</h2>
          <p className="text-sm text-ink-soft">Start by sharing your pickup location. We will confirm whether your area is covered and show the transport fare before you book.</p>
          <Link href="/request" className="btn-primary inline-flex">Request a pickup</Link>
          <Link href="/orders" className="ml-3 inline-flex text-sm font-medium text-brand-dark hover:underline">View my orders</Link>
        </section>
      )}
      <div className="card mt-8 divide-y divide-line">
        {[
          ["Name", profile?.full_name || "Not set"],
          ["Email", profile?.email ?? user.email ?? ""],
          ["Phone", profile?.phone || "Not set"],
          ["Customer code", profile?.customer_code ?? "Being created"],
          ["Account status", profile?.status ?? "active"],
          ["Access", roleNames.length ? roleNames.join(", ") : "Customer"],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-wrap justify-between gap-2 px-5 py-4 text-sm">
            <span className="text-ink-mute">{k}</span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
      </div>
      <section className="card mt-8 p-6">
        <h2 className="mb-4 text-lg font-semibold">Your details</h2>
        <ProfileForm name={profile?.full_name ?? ""} phone={profile?.phone ?? ""} />
        <div className="mt-5 border-t border-line pt-5"><OffersToggle initial={profile?.marketing_opt_in ?? false} /></div>
        <p className="mt-4 text-sm"><Link href="/account/security" className="font-medium text-brand-dark hover:underline">Change password or email</Link></p>
      </section>
      {(isSuper || isMoneyStaff || keys.includes("delivery_agent")) && (
        <div className="mt-8 flex flex-wrap gap-3">
          {isSuper && <Link href="/admin" className="btn-primary">Open super admin</Link>}
          {(isMoneyStaff || keys.includes("delivery_agent")) && <Link href="/staff" className="btn-secondary">Open staff area</Link>}
        </div>
      )}
    </main>
  );
}
