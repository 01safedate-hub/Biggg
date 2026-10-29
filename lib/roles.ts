import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export type Role = "super_admin" | "admin" | "secretary" | "cashier" | "delivery_agent" | "commission_agent";
export async function requireRole(allowed: Role[]) {
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
 const [{data:roleRows},{data:profile}]=await Promise.all([supabase.from("user_roles").select("role").eq("user_id",user.id),supabase.from("profiles").select("status,full_name").eq("id",user.id).maybeSingle()]);
 const roles=(roleRows??[]).map(r=>r.role as Role); if(profile?.status&&profile.status!=="active")redirect("/account"); if(!roles.some(r=>allowed.includes(r)))redirect("/account"); return{supabase,user,roles,name:profile?.full_name??""};
}
export async function requireUser(next:string){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect(`/login?next=${encodeURIComponent(next)}`);return{supabase,user};}
