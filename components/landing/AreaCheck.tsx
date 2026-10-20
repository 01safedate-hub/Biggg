"use client";

import { useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { naira } from "@/lib/format";

type Quote = { served?: boolean; reason?: string; is_open?: boolean; fare_kobo?: number; zone?: string; zone_name?: string };

export function AreaCheck({ etaMinutes }: { etaMinutes: number }) {
  const [state, setState] = useState<"idle" | "loading" | "served" | "unserved" | "denied" | "error">("idle");
  const [quote, setQuote] = useState<Quote | null>(null);

  function check() {
    if (!navigator.geolocation) return setState("denied");
    setState("loading");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { data, error } = await createClient().rpc("quote_pickup", {
          _lat: pos.coords.latitude,
          _lng: pos.coords.longitude,
        });
        if (error || !data) return setState("error");
        const q = data as Quote;
        setQuote(q);
        setState(q.served ? "served" : "unserved");
      },
      () => setState("denied"),
      { timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div className="card p-5" aria-live="polite">
      <p className="text-sm font-semibold">Check service at your location</p>
      <p className="mt-1 text-sm text-ink-mute">We use your location once to find your area and quote the transport fare. It is not stored.</p>
      <button onClick={check} disabled={state === "loading"} className="btn-secondary mt-4">
        {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MapPin className="h-4 w-4" aria-hidden />}
        {state === "loading" ? "Checking" : "Use my location"}
      </button>

      {state === "served" && quote && (
        <div className="mt-4 rounded-md border border-line bg-brand-tint p-3 text-sm">
          <p className="font-semibold">Service is available in your area.</p>
          <p className="mt-1 text-ink-soft">
            An agent can reach you in about {etaMinutes} minutes
            {typeof quote.fare_kobo === "number" ? `. Transport fare: ${naira(quote.fare_kobo)}, paid before the agent leaves.` : "."}
          </p>
          {quote.is_open === false && (
            <p className="mt-1 text-ink-soft">We are closed right now. You can still book and pickup will happen first thing tomorrow morning.</p>
          )}
        </div>
      )}
      {state === "unserved" && (
        <p className="mt-4 rounded-md border border-line bg-canvas p-3 text-sm text-ink-soft">
          {quote?.reason === "hub_not_set"
            ? "Pickup quotes are not open yet. Join the waitlist below and we will email you."
            : "We do not serve your location yet. Join the waitlist below and we will email you when we do."}
        </p>
      )}
      {state === "denied" && <p className="mt-4 text-sm text-ink-soft">Location access was not granted. You can still request a pickup and enter your address.</p>}
      {state === "error" && <p className="mt-4 text-sm text-red-700">We could not check right now. Please try again shortly.</p>}
    </div>
  );
}
