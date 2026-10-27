import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BookingForm } from "@/components/orders/BookingForm";
import { NoCashNotice } from "@/components/orders/NoCashNotice";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";

export const metadata = { title: "Request a pickup" };
export const dynamic = "force-dynamic";

export default async function RequestPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <main id="main" className="container-page max-w-2xl space-y-6 py-10">
      {user ? <CustomerSidebar /> : <Link href="/" className="text-sm font-medium text-ink-soft hover:text-ink">&larr; Home</Link>}
      <h1 className="text-3xl font-bold tracking-tight">Request a pickup</h1>
      <NoCashNotice />
      {user ? <BookingForm /> : (
        <div className="card space-y-4 p-6">
          <p className="text-sm text-ink-soft">Sign in or create an account to book. It takes a minute, and you will track everything on your phone.</p>
          <div className="flex gap-3"><Link href="/login?next=/request" className="btn-primary">Sign in</Link><Link href="/signup" className="btn-secondary">Create account</Link></div>
        </div>
      )}
    </main>
  );
}
