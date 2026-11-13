export const STAFF_ROLES = [
  { key: "delivery_agent", label: "Delivery agent", note: "Pickups and deliveries" },
  { key: "commission_agent", label: "Commission agent", note: "Bring in customers and earn tracked commissions" },
  { key: "cashier", label: "Cashier", note: "Counter, walk-ins, cash counts" },
  { key: "secretary", label: "Secretary", note: "Records expenses, checks and receives clothes" },
  { key: "washer", label: "Washer", note: "Washes, folds, and marks orders ready" },
  { key: "inspector", label: "Cleaning inspector", note: "Visits homes, records rooms and condition, prepares cleaning quotes" },
  { key: "cleaning_lead", label: "Cleaning lead", note: "Leads a cleaning crew: codes, checklist, photos, sign-off" },
  { key: "cleaner", label: "Cleaner", note: "Cleans on assigned visits and follows the checklist" },
  { key: "scheduler", label: "Cleaning scheduler", note: "Books inspections, assigns crews, manages cleaning plans" },
  { key: "admin", label: "Admin", note: "Runs daily operations" },
  { key: "super_admin", label: "Super admin", note: "Full control, approves expenses" },
] as const;
/** Roles that may work without a hub station. Everyone else (desk staff, washers, delivery agents) needs one. Mirrors staff-admin. */
export const STATION_OPTIONAL_ROLES = ["super_admin", "admin", "commission_agent", "inspector", "cleaning_lead", "cleaner", "scheduler"];
export const needsStation = (roles: readonly string[]) => roles.some((r) => !STATION_OPTIONAL_ROLES.includes(r));
export const ROLE_NAME: Record<string,string> = Object.fromEntries(STAFF_ROLES.map(r=>[r.key,r.label]));
export type StaffRowData={id:string;full_name:string;email:string|null;phone:string|null;status:"active"|"restricted"|"dismissed";status_reason:string|null;roles:string[];accepted:boolean;invited_at:string|null;last_sign_in_at:string|null;station_label?:string|null;station_zone_id?:string|null};
