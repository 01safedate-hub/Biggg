import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My account" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin", admin: "Admin", accountant: "Accountant", cashier: "Cashier", delivery_agent: "Delivery agent",
};

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null; // middleware redirects signed-out visitors

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("full_name,phone,email,customer_code,status").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const roleNames = (roles ?? []).map((r) => ROLE_LABEL[r.role] ?? r.role);
  const keys = (roles ?? []).map((r) => r.role as string);
  const isSuper = keys.includes("super_admin");
  const isMoneyStaff = isSuper || keys.some((k) => ["admin", "accountant", "cashier"].includes(k));

  return (
    <main id="main" className="container-page max-w-3xl py-12">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Home</Link>
        <form action="/auth/signout" method="post"><button className="btn-secondary">Sign out</button></form>
      </div>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">My account</h1>
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
      {(isSuper || isMoneyStaff) && (
        <div className="mt-8 flex flex-wrap gap-3">
          {isSuper && <Link href="/admin" className="btn-primary">Open super admin</Link>}
          {isMoneyStaff && <Link href="/staff" className="btn-secondary">Open staff area</Link>}
        </div>
      )}
    </main>
  );
}
