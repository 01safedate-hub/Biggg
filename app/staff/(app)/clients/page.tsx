import { redirect } from "next/navigation";

/** "My clients" was merged into Referrals → Customer referrals, which shows the same clients plus invitations and earnings. */
export default function MyClients() {
  redirect("/staff/referrals");
}
