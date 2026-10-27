import Link from "next/link";
import { requireRole } from "@/lib/roles";
import { LeaveDesk } from "@/components/staff/LeaveDesk";
export const metadata = { title: "Leave and shift swaps" };
export const dynamic = "force-dynamic";
export default async function LeavePage() {
 const { supabase, user, roles } = await requireRole(["super_admin","admin","secretary","cashier","delivery_agent"]);
 const isManager = roles.some(r=>["super_admin","admin","secretary"].includes(r));
 const [{data:types},{data:leaveRows},{data:shifts},{data:swaps},{data:people},{data:balances},{data:holidays},{data:blackouts}] = await Promise.all([
  supabase.from("leave_types").select("id,name,paid,annual_allowance_days").eq("active",true).order("name"),
  (isManager ? supabase.from("leave_requests").select("id,staff_id,start_date,end_date,reason,status,decided_by,decided_at,decision_note,leave_type_id,days_requested").order("created_at",{ascending:false}).limit(100) : supabase.from("leave_requests").select("id,staff_id,start_date,end_date,reason,status,decided_by,decided_at,decision_note,leave_type_id,days_requested").eq("staff_id",user.id).order("created_at",{ascending:false}).limit(100)),
  supabase.from("shifts").select("id,staff_id,shift_date,starts_at,ends_at").gte("starts_at",new Date().toISOString()).lte("starts_at",new Date(Date.now()+45*86400000).toISOString()).order("starts_at"),
  isManager ? supabase.from("shift_swaps").select("id,shift_id,requester_id,target_staff_id,status,reason,created_at,shift:shifts!shift_swaps_shift_id_fkey(id,shift_date,starts_at,ends_at,staff_id)").order("created_at",{ascending:false}).limit(100) : supabase.from("shift_swaps").select("id,shift_id,requester_id,target_staff_id,status,reason,created_at,shift:shifts!shift_swaps_shift_id_fkey(id,shift_date,starts_at,ends_at,staff_id)").or("requester_id.eq."+user.id+",target_staff_id.eq."+user.id).order("created_at",{ascending:false}).limit(100),
  supabase.rpc("list_delivery_agents_for_swap"),
  supabase.from("leave_balances").select("leave_type_id,year,allowance_days,adjustment_days").eq("staff_id",user.id).eq("year",new Date().getFullYear()),
  isManager ? supabase.from("public_holidays").select("id,holiday_date,name,grants_day_in_lieu").eq("active",true).order("holiday_date").limit(100) : Promise.resolve({data:[] as any[]}),
  isManager ? supabase.from("roster_blackouts").select("id,blackout_date,zone_id,reason").order("blackout_date").limit(100) : Promise.resolve({data:[] as any[]})
 ]);
 const peopleLite=(Array.isArray(people)?people:[]).map((p:any)=>({id:p.id,full_name:p.full_name||p.name||null,email:p.email||null,role:p.role||null}));
 const shiftRows=(shifts??[]) as any[];
 const swapRows=(swaps??[]).map((s:any)=>({...s,shift:Array.isArray(s.shift)?s.shift[0]??null:s.shift}));
 return <div className="space-y-5"><div><Link href="/staff/my-shifts" className="text-sm underline">← My shifts</Link><h1 className="mt-2 text-2xl font-bold tracking-tight">Leave and shift swaps</h1><p className="mt-1 text-sm text-ink-soft">{isManager?"Review team leave requests and accepted shift swaps.":"Request leave, cancel future requests, and ask colleagues to swap upcoming shifts."}</p></div>
 <LeaveDesk isManager={isManager} canRequestSwap={roles.some(r=>["delivery_agent","cashier","secretary"].includes(r))} userRole={roles.find(r=>["delivery_agent","cashier","secretary"].includes(r))||""} userId={user.id} types={(types??[]) as any} leaveRows={(leaveRows??[]) as any} shifts={shiftRows} swaps={swapRows as any} people={peopleLite} balances={(balances??[]) as any} holidays={(holidays??[]) as any} blackouts={(blackouts??[]) as any}/></div>;
}