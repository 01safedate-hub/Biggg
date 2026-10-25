import { Logo } from "@/components/brand/Logo";
import Link from "next/link";
import { MapPin } from "lucide-react";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#security", label: "Security" },
  { href: "#pricing", label: "Plans" },
  { href: "#coverage", label: "Coverage" },
  { href: "#faq", label: "FAQ" },
];

export function Header({ name, visitUrl }: { name: string; visitUrl?: string | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Logo size={32} />
          <span className="max-[400px]:sr-only">{name}</span>
        </Link>
        {visitUrl && (
          <a href={visitUrl} target="_blank" rel="noopener noreferrer" aria-label="Visit us now: open our location in Google Maps"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-brand/40 bg-brand-tint px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-dark hover:bg-brand hover:text-white sm:text-xs md:order-none">
            <MapPin className="h-3.5 w-3.5" aria-hidden />Visit us now
          </a>
        )}
        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-ink-soft hover:text-ink">{l.label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline">Sign in</Link>
          <Link href="/request" className="btn-primary">Request pickup</Link>
        </div>
      </div>
    </header>
  );
}
