import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { RequestForm } from "@/components/cleaning/RequestForm";
import { CLEANING_HOTLINE, CLEANING_TEL, CLEANING_WHATSAPP } from "@/lib/cleaning";

export const metadata: Metadata = { title: "Request a cleaning quote", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CleaningRequestPage({ searchParams }: { searchParams: Promise<{ service?: string; plan?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/cleaning/request");
  const { data } = await supabase.rpc("my_cleaning" as never);
  const properties = ((data as unknown as { properties?: { id: string; address: string; kind: string }[] } | null)?.properties ?? []);
  return (
    <main id="main" className="min-h-screen w-full">
      <CustomerSidebar />
      <div className="container-page mx-auto max-w-2xl space-y-6 py-6 sm:py-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Request a cleaning quote</h1>
          <p className="text-sm text-ink-soft">Tell us what you need. We call you, inspect if needed, and send a clear price you accept and pay online. You can also <a className="font-medium underline" href={`tel:${CLEANING_TEL}`}>call {CLEANING_HOTLINE}</a> or <a className="font-medium underline" href={CLEANING_WHATSAPP}>WhatsApp us</a>.</p>
        </div>
        <RequestForm userId={user.id} properties={properties} initialService={sp.service ?? "standard"} initialPlan={sp.plan === "1"} />
      </div>
    </main>
  );
}
