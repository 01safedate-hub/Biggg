"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { console.error(error); }, [error]);
  const details = `Page: ${typeof window !== "undefined" ? window.location.pathname : ""}\nCode: ${error.digest ?? "none"}\nTime: ${new Date().toISOString()}`;
  return (
    <main id="main" className="container-page grid min-h-[60vh] max-w-lg place-items-center py-16 text-center">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
        <p className="text-ink-soft">That was our mistake, not yours. Nothing was charged twice and nothing was lost. Try again, and if it keeps happening, contact us and quote the code below.</p>
        {error.digest && <p className="font-mono text-xs text-ink-mute">Code: {error.digest}</p>}
        <div className="flex flex-wrap justify-center gap-3"><button className="btn-primary" onClick={() => reset()}>Try again</button><Link href="/" className="btn-secondary">Go home</Link></div>
        <button type="button" className="text-sm text-ink-soft underline" onClick={async () => { try { await navigator.clipboard.writeText(details); setCopied(true); } catch { window.prompt("Copy these details and send them to us:", details); } }}>{copied ? "Copied. Send it to us" : "Copy details to report this"}</button>
      </div>
    </main>
  );
}
