"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main id="main" className="container-page grid min-h-[60vh] max-w-lg place-items-center py-16 text-center">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
        <p className="text-ink-soft">That was our mistake, not yours. Nothing was charged twice and nothing was lost. Try again, and if it keeps happening, contact us and quote the code below.</p>
        {error.digest && <p className="font-mono text-xs text-ink-mute">Code: {error.digest}</p>}
        <div className="flex flex-wrap justify-center gap-3"><button className="btn-primary" onClick={() => reset()}>Try again</button><Link href="/" className="btn-secondary">Go home</Link></div>
      </div>
    </main>
  );
}
