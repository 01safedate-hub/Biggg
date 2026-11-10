"use server";
import { requireRole } from "@/lib/roles";
import { revalidatePath } from "next/cache";
export async function supportPermission(userId:string,grant:boolean){
 const {supabase}=await requireRole(["super_admin"]);
 const supportGrantRpc=supabase.rpc as unknown as (fn:string,args:{_user:string;_grant:boolean})=>PromiseLike<{error:{message:string}|null}>;
 const {error}=await supportGrantRpc("staff_support_grant",{_user:userId,_grant:grant});
 if(error)return {ok:false,message:error.message};
 revalidatePath("/staff/support");return {ok:true,message:"Support access updated."};
}

export async function canManageSupport(){
 try{await requireRole(["super_admin"]);return true;}catch{return false;}
}
