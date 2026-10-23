import { CustomerTabs } from "@/components/customers/Tabs";

export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Customers and growth</h1><p className="mt-1 text-sm text-ink-soft">Who signs up, who comes back, who stopped, and how to win them back.</p></div>
      <CustomerTabs />
      {children}
    </div>
  );
}
