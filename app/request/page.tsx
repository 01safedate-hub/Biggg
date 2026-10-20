import Link from "next/link";

export const metadata = { title: "Request pickup" };

export default function RequestPage() {
  return (
    <main id="main" className="container-page grid min-h-screen place-items-center py-16">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Pickup requests are opening soon</h1>
        <p className="mt-3 text-sm text-ink-soft">
          Online booking and payment are being finalised. Join the waitlist on the home page and we will email you the moment it opens.
        </p>
        <Link href="/#coverage" className="btn-primary mt-6">Join the waitlist</Link>
      </div>
    </main>
  );
}
