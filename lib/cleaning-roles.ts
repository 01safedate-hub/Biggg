import type { Role } from "@/lib/roles";

// Who can open each cleaning screen. The database checks the same groups again.
export const CLEANING_ALL: Role[] = ["inspector", "cleaning_lead", "cleaner", "scheduler", "secretary", "cashier", "admin", "super_admin"];
export const CLEANING_DESK: Role[] = ["scheduler", "secretary", "cashier", "admin", "super_admin"];
export const CLEANING_MANAGER: Role[] = ["scheduler", "admin", "super_admin"];
export const CLEANING_MONEY: Role[] = ["cashier", "secretary", "admin", "super_admin"];
export const CLEANING_ADMIN: Role[] = ["admin", "super_admin"];
export const CLEANING_CREW: Role[] = ["cleaning_lead", "cleaner", "scheduler", "admin", "super_admin"];
// Can search customers and create walk-in customer records (existing desk tools).
export const CUSTOMER_LINKERS: Role[] = ["secretary", "admin", "super_admin"];
