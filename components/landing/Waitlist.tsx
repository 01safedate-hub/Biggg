"use client";

import { useState } from "react";

export function Waitlist() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={submit} className="card p-6" aria-live="polite">
      <h3 className="text-lg font-semibold">Not in a service area yet?</h3>
      <p className="mt-1 text-sm text-ink-soft">Join the waitlist and we will email you when we reach you.</p>
      {state === "done" ? (
        <p className="mt-4 rounded-md bg-brand-tint p-3 text-sm font-medium">Thank you. You are on the list and we will be in touch.</p>
      ) : (
        <>
          <label htmlFor="waitlist-email" className="mt-4 block text-sm font-medium">Email address</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              id="waitlist-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              placeholder="you@example.com"
            />
            <button className="btn-primary shrink-0" disabled={state === "sending"}>{state === "sending" ? "Sending" : "Join waitlist"}</button>
          </div>
          {state === "error" && <p className="mt-2 text-sm text-red-700">Something went wrong. Please check the address and try again.</p>}
        </>
      )}
    </form>
  );
}
