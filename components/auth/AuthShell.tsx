import { Logo } from "@/components/brand/Logo";
import Link from "next/link";

export function AuthShell({ title, subtitle, children, footer }: {
  title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <main id="main" className="grid min-h-screen place-items-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-lg font-bold tracking-tight">
          <Logo size={32} />
          LaundryPoint
        </Link>
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-soft">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <p className="mt-6 text-center text-sm text-ink-soft">{footer}</p>}
      </div>
    </main>
  );
}

export function Field({ label, id, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <input id={id} name={id} {...props} className="mt-1 w-full rounded-md border border-line px-3 py-2.5 text-sm focus:border-brand focus:outline-none" />
      {hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}
    </div>
  );
}

export function FormMessage({ kind, children }: { kind: "error" | "info"; children: React.ReactNode }) {
  return (
    <p role={kind === "error" ? "alert" : "status"}
       className={`rounded-md border p-3 text-sm ${kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-line bg-brand-tint text-ink"}`}>
      {children}
    </p>
  );
}
