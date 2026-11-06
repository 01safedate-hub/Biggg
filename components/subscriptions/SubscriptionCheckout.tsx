"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Plan = { slug: string; name: string; priceKobo: number; pieces: number | null; monthlyDiscountPct?: number; threeMonthDiscountPct?: number; sixMonthDiscountPct?: number; yearlyDiscountPct?: number; pickups?: number; student?: boolean };
/** The customer's live plan, when this purchase is for the next term. */
type Current = { name: string; lastDay: string; startsOn: string; nextPaid: boolean } | null;
type StudentStatus = "none" | "pending" | "approved" | "rejected";
const ERRORS: Record<string, string> = {
  student_id_required: "Upload your student ID before paying for a student plan.",
  student_id_not_approved: "Your student ID must be approved before you can switch to a student plan.",
  subscription_under_review: "Your student plan is waiting for the ID check. You can buy a plan once it is approved.",
  next_term_already_paid: "Your next term is already paid. Contact us if you need to change it.",
  plan_not_found: "That plan is not available.",
};
type BillingPeriod = "monthly" | "three_month" | "six_month" | "yearly";
const naira = (kobo: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(kobo / 100);
const months: Record<BillingPeriod, number> = { monthly: 1, three_month: 3, six_month: 6, yearly: 12 };
const discount: Record<BillingPeriod, number> = { monthly: 0, three_month: 2, six_month: 5, yearly: 10 };

function PaystackMark() {
  return <img src="https://upload.wikimedia.org/wikipedia/commons/0/0b/Paystack_Logo.png" alt="Paystack" width="136" height="32" className="h-8 w-28 shrink-0 object-contain object-left sm:w-[136px]" />;
}
function FlutterwaveMark() {
  return <img src="https://upload.wikimedia.org/wikipedia/commons/9/9e/Flutterwave_Logo.png" alt="Flutterwave" width="136" height="32" className="h-8 w-[136px] shrink-0 object-contain object-left" />;
}

export function SubscriptionCheckout({ plans, initialPlanSlug, initialBillingPeriod = "monthly", yearlyDiscountPct = 10, current = null, userId, studentStatus = "none" }: { plans: Plan[]; initialPlanSlug?: string; initialBillingPeriod?: BillingPeriod; yearlyDiscountPct?: number; current?: Current; userId: string; studentStatus?: StudentStatus }) {
  const [student, setStudent] = useState<StudentStatus>(studentStatus);
  const [school, setSchool] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [planSlug, setPlanSlug] = useState(plans.some((plan) => plan.slug === initialPlanSlug) ? initialPlanSlug! : plans[0]?.slug ?? "");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(initialBillingPeriod);
  const [message, setMessage] = useState("");
  const [busyProvider, setBusyProvider] = useState<"paystack" | "flutterwave" | null>(null);
  const selectedPlan = plans.find((plan) => plan.slug === planSlug);
  const monthsCount = months[billingPeriod];
  const discountPct = billingPeriod === "yearly" ? Number(selectedPlan?.yearlyDiscountPct ?? yearlyDiscountPct) : billingPeriod === "six_month" ? Number(selectedPlan?.sixMonthDiscountPct ?? discount.six_month) : billingPeriod === "three_month" ? Number(selectedPlan?.threeMonthDiscountPct ?? discount.three_month) : Number(selectedPlan?.monthlyDiscountPct ?? 0);
  const totalKobo = selectedPlan ? Math.round(selectedPlan.priceKobo * monthsCount * (1 - discountPct / 100)) : 0;

  async function pay(provider: "paystack" | "flutterwave") {
    if (!planSlug || busyProvider) return;
    setBusyProvider(provider);
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("pay-init", { body: { purpose: "subscription", plan_slug: planSlug, billing_period: billingPeriod, provider } });
      if (error) {
        let code = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") { try { code = (await ctx.json())?.error ?? code; } catch { /* keep */ } }
        throw new Error(ERRORS[String(code)] ?? "Could not start payment. Please try again.");
      }
      const result = data as { url?: string; error?: string } | null;
      if (!result?.url) throw new Error(result?.error ?? "Could not start payment. Please try again.");
      window.location.assign(result.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not start payment. Please try again.");
      setBusyProvider(null);
    }
  }

  const needsId = !!selectedPlan?.student && (current ? student !== "approved" : student !== "pending" && student !== "approved");
  const pickups = Number(selectedPlan?.pickups ?? 2);

  async function uploadId(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setMessage("Choose a photo or PDF of your student ID.");
    if (file.size > 5 * 1024 * 1024) return setMessage("The file is too large. Use a photo or PDF under 5 MB.");
    setUploading(true); setMessage("");
    const supabase = createClient();
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
    const path = `${userId}/${Date.now()}.${ext}`;
    const up = await supabase.storage.from("student-ids").upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (up.error) { setUploading(false); return setMessage("The upload failed. Check your connection and try again."); }
    const { data, error } = await supabase.rpc("submit_student_verification", { _storage_path: path, _school_name: school });
    setUploading(false);
    if (error) return setMessage(/school_name_required/.test(error.message) ? "Enter the name of your school." : "We could not save your ID. Please try again.");
    setStudent(((data as { status?: StudentStatus } | null)?.status ?? "pending"));
  }

  if (!plans.length) return <p className="card p-5">No subscription plans are available right now. Please try again later.</p>;
  return (
    <section className="card space-y-5 p-5">
      {current ? <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">You are on {current.name} until {current.lastDay}.</p><p className="mt-1">{current.nextPaid ? "Your next term is already paid." : `What you buy here is your next term. It starts on ${current.startsOn}, when your current plan ends. Nothing changes before then, and your current plan is not refunded or shortened.`}</p></div> : null}
      <div className="space-y-2"><label htmlFor="plan" className="block text-sm font-medium">Subscription plan</label><select id="plan" value={planSlug} onChange={e => setPlanSlug(e.target.value)} disabled={!!busyProvider} className="w-full rounded-lg border border-line bg-white p-3 disabled:opacity-60">{plans.map(p => <option key={p.slug} value={p.slug}>{p.name} — {naira(p.priceKobo)} / month · {p.pieces ?? "Plan"} pieces{p.student ? " · students" : ""}</option>)}</select></div>
      <div className="space-y-2"><label htmlFor="billing-period" className="block text-sm font-medium">Billing duration</label><select id="billing-period" value={billingPeriod} onChange={e => setBillingPeriod(e.target.value as BillingPeriod)} disabled={!!busyProvider} className="w-full rounded-lg border border-line bg-white p-3 disabled:opacity-60"><option value="monthly">1 month — {selectedPlan?.monthlyDiscountPct ?? 0}% discount</option><option value="three_month">3 months — {selectedPlan?.threeMonthDiscountPct ?? 2}% discount</option><option value="six_month">6 months — {selectedPlan?.sixMonthDiscountPct ?? 5}% discount</option><option value="yearly">12 months — {selectedPlan?.yearlyDiscountPct ?? yearlyDiscountPct}% discount</option></select></div>
      <div className="rounded-lg bg-slate-50 p-4 text-sm"><div className="flex justify-between"><span>Duration</span><strong>{monthsCount} months</strong></div><div className="mt-2 flex justify-between"><span>Discount</span><strong>{discountPct}%</strong></div><div className="mt-2 flex justify-between text-base"><span>Total payable</span><strong>{naira(totalKobo)}</strong></div><p className="mt-2 text-xs text-ink-soft">{pickups > 0 ? `Includes ${pickups} free pickups each month, any time you like. After that, pickups are available with paid transport.` : "No free pickups: bring your clothes to the hub, or book a pickup and pay for transport."} Unused pieces do not carry over to the next month. Items the plan does not cover, and pieces above the allowance or a category limit, are charged at the normal item price.</p><p className="mt-2 text-xs text-ink-soft">Term discounts are configured by LaundryPoint. Final amount is calculated and validated by the server before checkout.</p></div>
      {selectedPlan?.student ? (
        student === "approved" ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Your student ID is approved.</p>
        : student === "pending" && !current ? <p className="rounded-lg border border-line bg-canvas p-3 text-sm text-ink-soft">Your student ID is uploaded. You can pay now: the plan starts on the day we approve your ID. If we cannot accept it, we cancel the plan and refund you in full.</p>
        : student === "pending" ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Your student ID is being checked. You can switch to a student plan once it is approved.</p>
        : <form onSubmit={uploadId} className="space-y-3 rounded-lg border border-line p-4">
            <p className="text-sm font-medium">Student plans need a valid student ID</p>
            {student === "rejected" ? <p className="text-sm text-red-700">Your last ID was not accepted. Please upload a clear, valid one.</p> : null}
            <div><label htmlFor="school" className="block text-sm font-medium">School name</label><input id="school" value={school} onChange={(e) => setSchool(e.target.value)} required minLength={2} maxLength={120} className="mt-1 w-full rounded-lg border border-line bg-white p-3" /></div>
            <div><label htmlFor="sid" className="block text-sm font-medium">Photo or PDF of your student ID</label><input id="sid" type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required className="mt-1 block w-full text-sm" /></div>
            <button className="btn-secondary" disabled={uploading}>{uploading ? "Uploading…" : "Upload student ID"}</button>
            <p className="text-xs text-ink-soft">Only LaundryPoint staff can see this file. We use it only to confirm you are a student.</p>
          </form>
      ) : null}
      <div className="space-y-3"><p className="text-sm font-medium">Choose how you want to pay</p>
        <button type="button" disabled={!!busyProvider || !planSlug || needsId || !!current?.nextPaid} onClick={() => pay("paystack")} className="flex min-h-20 w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-line bg-white px-3 py-4 text-left shadow-sm transition hover:border-[#00C3F7] hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 sm:gap-4 sm:px-4"><PaystackMark /><span className="min-w-0 flex-1"><span className="block whitespace-nowrap text-sm font-semibold text-ink sm:text-base">{busyProvider === "paystack" ? "Opening Paystack…" : "Pay with Paystack"}</span><span className="mt-1 block text-xs text-ink-soft">Secure online checkout</span></span></button>
        <button type="button" disabled={!!busyProvider || !planSlug || needsId || !!current?.nextPaid} onClick={() => pay("flutterwave")} className="flex min-h-20 w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-line bg-white px-3 py-4 text-left shadow-sm transition hover:border-[#F5A623] hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 sm:gap-4 sm:px-4"><FlutterwaveMark /><span className="min-w-0 flex-1"><span className="block whitespace-nowrap text-sm font-semibold text-ink sm:text-base">{busyProvider === "flutterwave" ? "Opening Flutterwave…" : "Pay with Flutterwave"}</span><span className="mt-1 block text-xs text-ink-soft">Secure online checkout</span></span></button>
      </div>
      {message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null}
    </section>
  );
}
