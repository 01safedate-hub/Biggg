import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Each kind of staff gets their own installable app: agents, the desk (secretary and admin), and cashiers. */
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const roles = (data ?? []).map((r) => r.role as string);
  const desk = roles.some((r) => ["secretary", "admin", "super_admin"].includes(r));
  const kind = desk ? "desk" : roles.includes("delivery_agent") ? "agent" : "cashier";
  const title = kind === "desk" ? "LaundryPoint Desk" : kind === "agent" ? "LaundryPoint Agent" : "LaundryPoint Cashier";
  return { manifest: `/manifest/${kind}`, appleWebApp: { capable: true, title, statusBarStyle: "default" } };
}

export default function StaffRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
