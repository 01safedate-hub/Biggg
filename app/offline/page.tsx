import { Logo } from "@/components/brand/Logo";

export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4">
      <div className="max-w-sm text-center">
        <Logo size={56} className="mx-auto" />
        <h1 className="mt-6 text-2xl font-bold tracking-tight">You are offline</h1>
        <p className="mt-2 text-sm text-ink-soft">Check your connection and try again. Your orders and payments are safe on our servers.</p>
      </div>
    </main>
  );
}
