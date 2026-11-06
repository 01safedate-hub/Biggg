"use server";
import { requireRole } from "@/lib/roles";
import { revalidatePath } from "next/cache";
const ALLOWED=["super_admin","admin","secretary"] as const;
export async function supportPermission(userId:string,grant:boolean){
 const {supabase}=await requireRole(["super_admin"]);
 const {error}=await supabase.rpc("staff_support_grant",{_user:userId,_grant:grant});
 if(error)return {ok:false,message:error.message};
 revalidatePath("/staff/support");return {ok:true,message:"Support access updated."};
}
