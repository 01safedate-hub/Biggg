import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FormMessage } from "@/components/auth/AuthShell";
import { PasswordForm } from "@/components/account/PasswordForm";
import { EmailForm } from "@/components/account/EmailForm";
import { SignOutEverywhere } from "@/components/account/SignOutEverywhere";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { SettingsTabs } from "@/components/account/SettingsTabs";

export const metadata = { title: "Password and email" };
export const dynamic = "force-dynamic";

const NOTICE: Record<string, string> = {
  email_changed: "Your email address was changed.",
  email_pending: "One of the two confirmations is done. Open the link we sent to the other address to finish the change.",
};

const STAFF = ["super_admin", "admin", "secretary", "cashier", "delivery_agent", "commission_agent", "washer", "inspector", "cleaning_lead", "cleaner", "scheduler"];

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ notice?: string; forced?: string }> }) {
  const { notice, forced } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return null; // middleware redirects signed-out visitors
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  // Staff reach this page for forced password changes; keep their view free of the customer menu.
  const isStaff = (roles ?? []).some((r) => STAFF.includes(String(r.role)));

  const sections = (
    <>
      {forced === "1" && <FormMessage kind="info">Your password was set for you. Choose your own now to continue. Use the password you were given as the current one.</FormMessage>}
      {notice && NOTICE[notice] && <FormMessage kind="info">{NOTICE[notice]}</FormMessage>}
      <section className="card p-6"><h2 className="mb-4 text-lg font-semibold">Change password</h2><PasswordForm email={user.email} forced={forced === "1"} /></section>
      <section className="card p-6">
        <h2 className="mb-1 text-lg font-semibold">Change email</h2>
        <p className="mb-4 text-sm text-ink-soft">To keep your account safe, we send a link to confirm the new address before the change takes effect.</p>
        <EmailForm email={user.email} pendingEmail={user.new_email ?? null} />
      </section>
      <section className="card p-6">
        <h2 className="text-lg font-semibold">Devices</h2>
        <p className="mb-4 mt-1 text-sm text-ink-soft">Lost a phone or used a shared computer? Sign out everywhere, then sign in again where you are.</p>
        <SignOutEverywhere />
      </section>
    </>
  );

  if (isStaff) {
    return (
      <main id="main" className="container-page max-w-2xl space-y-8 py-12">
        <Link href="/account" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; My account</Link>
        <h1 className="text-3xl font-bold tracking-tight">Password and email</h1>
        {sections}
      </main>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  return (
    <main id="main" className="min-h-screen w-full">
      <CustomerSidebar name={profile?.full_name || user.email} />
      <div className="container-page mx-auto max-w-3xl space-y-8 py-4 sm:py-6">
        <SettingsTabs current="/account/security" />
        {sections}
      </div>
    </main>
  );
}
