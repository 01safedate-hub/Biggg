import type { Metadata } from "next";
import { requireUser } from "@/lib/roles";
import { CustomerSidebar } from "@/components/customer/CustomerSidebar";
import { CUSTOMER_STEPS, visibleSteps, type StepProgress } from "@/lib/guide-content";
import { ProgressActions, StartGuideButton, StepList } from "@/components/guide/GuideHub";

export const metadata: Metadata = { title: "Getting started", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CustomerGuidePage() {
  const { supabase, user } = await requireUser("/guide");
  const [{ data: prefs }, { data: subs }, { data: customs }] = await Promise.all([
    supabase.rpc("my_ui_prefs" as never),
    supabase.from("subscriptions").select("id").eq("customer_id", user.id).eq("status", "active").limit(1),
    supabase.rpc("my_customs"),
  ]);
  const progress = (((prefs as unknown as { tours?: Record<string, unknown> } | null)?.tours?.customer) ?? {}) as StepProgress;
  const hrefs = ["/dashboard", "/request", "/orders", subs?.length ? "/subscriptions/manage" : "/subscriptions", "/cleaning/my", "/account/extra-clothes", "/account", "/guide",
    ...(Array.isArray(customs) && customs.length ? ["/my-customs"] : [])];
  const steps = visibleSteps(CUSTOMER_STEPS, hrefs);
  const seen = steps.filter((s) => (progress.seen ?? []).includes(s.id)).length;
  const started = Boolean(progress.status);
  return (
    <main id="main" className="min-h-screen">
      <CustomerSidebar />
      <div className="container-page mx-auto max-w-3xl space-y-6 pb-10 pt-4 sm:pt-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Getting started</h1>
          <p className="mt-2 text-sm text-ink-soft">A quick tour of your account. Each step highlights a page in the menu. Skip what you already know and come back any time.</p>
        </div>
        <section className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{progress.status === "done" ? "Tour finished" : started ? "Tour in progress" : "Not started yet"}</p>
              <p className="text-sm text-ink-soft">{seen} of {steps.length} steps seen</p>
            </div>
            <StartGuideButton kind="customer" label={progress.status === "in_progress" ? "Continue the tour" : progress.status === "done" ? "Take the tour again" : "Start the tour"}
              stepId={progress.status === "in_progress" ? steps[Math.min(progress.step ?? 0, steps.length - 1)]?.id : undefined} />
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.round((seen / Math.max(steps.length, 1)) * 100)}%` }} /></div>
          <ProgressActions kind="customer" progress={progress} />
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">All steps</h2>
          <p className="mt-1 text-xs text-ink-mute">Open a step to read it, or show it in the app.</p>
          <StepList kind="customer" steps={steps} progress={progress} />
        </section>
      </div>
    </main>
  );
}
