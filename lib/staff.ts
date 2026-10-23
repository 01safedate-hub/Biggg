export const STAFF_ROLES = [
  { key: "delivery_agent", label: "Delivery agent", note: "Pickups and deliveries" },
  { key: "cashier", label: "Cashier", note: "Counter, walk-ins, cash counts" },
  { key: "secretary", label: "Secretary", note: "Records expenses, checks and receives clothes" },
  { key: "admin", label: "Admin", note: "Runs daily operations" },
  { key: "super_admin", label: "Super admin", note: "Full control, approves expenses" },
] as const;

export const ROLE_NAME: Record<string, string> = Object.fromEntries(STAFF_ROLES.map((r) => [r.key, r.label]));

export type StaffRowData = {
  id: string; full_name: string; email: string | null; phone: string | null; status: "active" | "restricted" | "dismissed";
  status_reason: string | null; roles: string[]; accepted: boolean; invited_at: string | null; last_sign_in_at: string | null;
};
