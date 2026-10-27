"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Quote = { served: boolean; zone_name?: string; zone_id?: string; reason?: string; total_fare_kobo?: number };

export function LocationOnboarding() {
  const router = useRouter();
  const [pos, setPos] = useState<{lat:number;lng:number}|null>(null);
  const [quote, setQuote] = useState<Quote|null>(null);
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function locate() {
    setError(""); setQuote(null);
    if (!navigator.geolocation) { setError("Location is not supported by this browser."); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async (p) => {
      const here = {lat:p.coords.latitude,lng:p.coords.longitude};
      setPos(here);
      const result = await createClient().rpc("quote_pickup",{_lat:here.lat,_lng:here.lng});
      setBusy(false);
      if (result.error) { setError("We could not check this location. Please try again."); return; }
      setQuote(result.data as unknown as Quote);
    },()=>{setBusy(false);setError("Allow location access and try again.");},{enableHighAccuracy:true,timeout:15000});
  }

  async function continueToPlans() {
    if (!pos || !quote?.served || !address.trim()) return;
    setBusy(true); setError("");
    const supabase = createClient();
    const auth = await supabase.auth.getUser();
    if (!auth.data.user) { setBusy(false); router.replace("/login?next=/onboarding/location"); return; }
    const existing = await supabase.from("addresses").select("id").eq("user_id",auth.data.user.id).order("created_at",{ascending:true}).limit(1).maybeSingle();
    const values = {label:"Home",lat:pos.lat,lng:pos.lng,formatted_address:address.trim(),zone_id:quote.zone_id ?? null};
    const saved = existing.data?.id
      ? await supabase.from("addresses").update(values).eq("id",existing.data.id).eq("user_id",auth.data.user.id)
      : await supabase.from("addresses").insert({user_id:auth.data.user.id,...values});
    setBusy(false);
    if (saved.error) { setError("We could not save this address. Please check the address and try again."); return; }
    router.push("/subscriptions"); router.refresh();
  }

  async function joinWaitlist() {
    if (!pos || !email.trim()) return;
    setBusy(true); setError("");
    // The generated Supabase Database type predates this newly applied RPC.
    // Keep the cast local until database types are regenerated from the live schema.
    const rpc = createClient().rpc as unknown as (
      name: string,
      args: Record<string, string | number>
    ) => Promise<{ error: { message: string } | null }>;
    const { error: waitlistError } = await rpc("join_service_waitlist", {
      _email: email.trim(),
      _lat: pos.lat,
      _lng: pos.lng,
      _detected_area: quote?.zone_name || "Uncovered area",
    });
    setBusy(false);
    if (waitlistError) { setError("We could not submit your waitlist request. Please check the email and try again."); return; }
    setDone(true);
  }

  return <main id="main" className="container-page max-w-2xl space-y-6 py-10">
    <Link href="/account" className="text-sm font-medium text-ink-soft">← My account</Link>
    <div className="space-y-2"><p className="eyebrow">Welcome to LaundryPoint</p><h1 className="text-3xl font-bold tracking-tight">Check if we serve your area</h1><p className="text-sm leading-6 text-ink-soft">Confirm your collection area before choosing a monthly plan. We check your location against our active service zones.</p></div>
    <section className="card space-y-4 p-5">
      <button type="button" className="btn-primary" disabled={busy} onClick={locate}>{busy ? "Checking…" : "Use my current location"}</button>
      {quote && <div className="rounded-lg border border-line bg-canvas p-4"><h2 className="font-semibold">{quote.served ? "Good news — we serve your area" : "We do not serve this area yet"}</h2><p className="mt-1 text-sm text-ink-soft">{quote.served ? "Add your pickup address to continue to monthly plans." : "Join the waitlist and we will let you know when LaundryPoint becomes available near you."}</p></div>}
      {quote?.served && <div className="space-y-3"><label className="block text-sm font-medium" htmlFor="address">Pickup address / landmark</label><textarea id="address" value={address} onChange={e=>setAddress(e.target.value)} rows={3} placeholder="House number, street, estate or nearby landmark" className="w-full rounded-md border border-line bg-white p-3 text-sm"/><button type="button" disabled={busy||!address.trim()} className="btn-primary w-full" onClick={continueToPlans}>Continue to monthly plans</button></div>}
      {quote && !quote.served && !done && <div className="space-y-3"><label className="block text-sm font-medium" htmlFor="waitlist-email">Email address for the waitlist</label><input id="waitlist-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-md border border-line p-3 text-sm"/><button type="button" className="btn-primary w-full" disabled={busy||!email.trim()} onClick={joinWaitlist}>Join the waitlist</button></div>}
      {done && <p role="status" className="rounded-md bg-brand-tint p-3 text-sm font-medium">Thanks — your waitlist request has been submitted.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  </main>;
}
