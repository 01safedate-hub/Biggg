import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { CLEANING_DESK, CUSTOMER_LINKERS } from "@/lib/cleaning-roles";
import { StaffRequestForm } from "@/components/cleaning/StaffRequestForm";

export const metadata = { title: "New cleaning request" };

export default async function NewCleaningRequest() {
  const { roles } = await requireRole(CLEANING_DESK);
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/staff/cleaning" className="text-sm text-ink-soft hover:underline">← Cleaning requests</Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">New cleaning request</h1>
        <p className="mt-1 text-sm text-ink-soft">For phone, WhatsApp and walk-in customers. Ask: what kind of clean, how many rooms, any painting or building work, is there water, and when they want it.</p>
      </div>
      <StaffRequestForm canLink={roles.some((r) => CUSTOMER_LINKERS.includes(r))} />
    </div>
  );
}
