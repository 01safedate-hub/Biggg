import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="container-page grid min-h-[60vh] max-w-lg place-items-center py-16 text-center">
      <div className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-dark">404</p>
        <h1 className="text-3xl font-bold tracking-tight">We could not find that page</h1>
        <p className="text-ink-soft">The link may be old, or the order may belong to a different account. Check you are signed in with the right email.</p>
        <div className="flex flex-wrap justify-center gap-3"><Link href="/orders" className="btn-primary">My orders</Link><Link href="/" className="btn-secondary">Go home</Link></div>
      </div>
    </main>
  );
}
