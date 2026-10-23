import { CountForm } from "@/components/admin/CountForm";
import { requireRole } from "@/lib/roles";

export const metadata = { title: "Count money" };

export default async function CountPage() {
  const { supabase } = await requireRole(["super_admin", "admin", "accountant", "cashier"]);
  const { data: pts } = await supabase.from("money_points").select("id,name").eq("active", true).order("name");
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Count money</h1>
      <CountForm points={pts ?? []} />
    </div>
  );
}
