import { Shell, type NavGroup } from "@/components/admin/Shell";
import { requireRole } from "@/lib/roles";
import { enforceStaffGate } from "@/lib/staff-gate";
import { SupportNotifications } from "@/components/staff/SupportNotifications";
export default async function StaffLayout({children}:{children:React.ReactNode}){
 const {supabase,name,roles}=await requireRole(["super_admin","admin","secretary","cashier","delivery_agent","commission_agent","washer","inspector","cleaning_lead","cleaner","scheduler"]);
 const washerOnly=roles.includes("washer")&&!roles.some(r=>["super_admin","admin","secretary","cashier","delivery_agent","commission_agent"].includes(r));
 // Cleaning-only staff (cleaners, crew leads, inspectors, schedulers) see only the cleaning tools.
 const cleaningOnly=!roles.some(r=>["super_admin","admin","secretary","cashier","delivery_agent","commission_agent","washer"].includes(r));
 await enforceStaffGate(supabase,{skipOnboarding:roles.includes("super_admin")});
 const work:NavGroup["items"]=[{href:"/staff",label:"Home",icon:"home",exact:true},{href:"/staff/my-shifts",label:"My shifts",icon:"weekly"},{href:"/staff/leave",label:"Leave and swaps",icon:"weekly"}];
 if(washerOnly){work.push({href:"/staff/hub",label:"Wash queue",icon:"hub"},{href:"/staff/shelves",label:"Shelf map",icon:"hub"});}
 if(roles.some(r=>["cashier","secretary","admin","super_admin"].includes(r)))work.push({href:"/staff/orders",label:"Orders",icon:"jobs"},{href:"/staff/shelves",label:"Shelf map",icon:"hub"},{href:"/staff/customs",label:"Customs",icon:"customers"});
 if(roles.some(r=>["cashier","secretary","admin","super_admin"].includes(r)))work.push({href:"/staff/subscription-pickup-calls",label:"Subscription pickup calls",icon:"weekly"});
 if(roles.some(r=>["secretary","admin","super_admin"].includes(r)))work.push({href:"/staff/student-ids",label:"Student IDs",icon:"weekly"});
 if(roles.includes("secretary")||roles.includes("super_admin"))work.push({href:"/staff/expenses",label:"Record expense",icon:"record"});
 if(roles.some(r=>["secretary","admin","super_admin"].includes(r)))work.push({href:"/staff/agent-verification",label:"Verify agents",icon:"customers"});
 if(roles.some(r=>["delivery_agent","commission_agent"].includes(r)))work.push({href:"/staff/jobs",label:"My jobs",icon:"jobs"});
 if(roles.some(r=>["delivery_agent","commission_agent","admin","super_admin"].includes(r)))work.push({href:"/staff/referrals",label:"Referrals",icon:"customers"});
 if(roles.some(r=>["delivery_agent","commission_agent"].includes(r)))work.push({href:"/staff/commissions",label:"My commissions",icon:"money"});
 if(roles.some(r=>["secretary","admin","super_admin"].includes(r))){work.push({href:"/staff/dispatch",label:"Dispatch",icon:"dispatch"},{href:"/staff/online",label:"Online orders",icon:"dispatch"},{href:"/staff/instant",label:"Instant orders",icon:"dispatch"},{href:"/staff/walkin",label:"Walk-in orders",icon:"customers"},{href:"/staff/receiving",label:"Receiving",icon:"receiving"},{href:"/staff/hub",label:"Wash queue",icon:"hub"},{href:"/staff/issues",label:"Customer problems",icon:"reports"},{href:"/staff/roster",label:"Shift roster",icon:"weekly"});}
 if(roles.some(r=>["admin","super_admin"].includes(r)))work.push({href:"/staff/speed",label:"Speed analytics",icon:"overview"},{href:"/staff/transport",label:"Free transport",icon:"dispatch"});
 const cleaning:NavGroup["items"]=[];
 if(roles.some(r=>["scheduler","secretary","cashier","inspector","admin","super_admin"].includes(r)))cleaning.push({href:"/staff/cleaning",label:"Cleaning requests",icon:"record",exact:true});
 if(roles.some(r=>["cleaning_lead","cleaner","scheduler","admin","super_admin"].includes(r)))cleaning.push({href:"/staff/cleaning/jobs",label:"My cleaning jobs",icon:"jobs"});
 if(roles.some(r=>["scheduler","secretary","cashier","inspector","cleaning_lead","admin","super_admin"].includes(r)))cleaning.push({href:"/staff/cleaning/board",label:"Cleaning board",icon:"weekly"});
 if(roles.some(r=>["scheduler","secretary","cashier","admin","super_admin"].includes(r)))cleaning.push({href:"/staff/cleaning/plans",label:"Cleaning plans",icon:"customers"},{href:"/staff/cleaning/issues",label:"Cleaning issues",icon:"reports"});
 if(roles.some(r=>["cashier","secretary","admin","super_admin"].includes(r)))cleaning.push({href:"/staff/cleaning/invoices",label:"Cleaning bills",icon:"money"});
 if(roles.some(r=>["scheduler","admin","super_admin"].includes(r)))cleaning.push({href:"/staff/cleaning/settings",label:"Cleaning settings",icon:"settings"});
 if(roles.some(r=>["admin","super_admin"].includes(r)))cleaning.push({href:"/staff/cleaning/report",label:"Cleaning report",icon:"overview"});
 if(!washerOnly&&!cleaningOnly)work.push({href:"/staff/spending",label:"Spending",icon:"spending"}); if(!washerOnly&&!cleaningOnly&&roles.some(r=>r!=="delivery_agent"&&r!=="commission_agent"))work.push({href:"/staff/count",label:"Count money",icon:"count"});
 const {data:supportAllowed}=await supabase.rpc("staff_support_allowed");
 if(supportAllowed===true)work.push({href:"/staff/support",label:"Customer support",icon:"support"});
 const groups:NavGroup[]=[{label:"My work",items:work},...(cleaning.length?[{label:"Cleaning",items:cleaning}]:[]),{label:"Me",items:[{href:"/staff/onboarding",label:"My details",icon:"customers"},{href:"/staff/savings",label:"My savings",icon:"money"}]}]; if(roles.includes("super_admin"))groups.push({label:"Manage",items:[{href:"/admin",label:"Super admin",icon:"admin"}]});
 return <Shell title="Staff" name={name} groups={groups}>{supportAllowed===true&&<SupportNotifications />}{children}</Shell>;
}
