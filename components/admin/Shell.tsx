import { Sidebar, type NavGroup } from "./Sidebar";

export type { NavGroup, NavItem } from "./Sidebar";

export function Shell({ title, name, groups, children }: { title: string; name: string; groups: NavGroup[]; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar title={title} name={name} groups={groups} />
      <div className="lg:pl-64">
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}
    </div>
  );
}
