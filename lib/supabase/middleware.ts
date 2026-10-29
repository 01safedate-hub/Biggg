import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

const PROTECTED = ["/account", "/staff", "/admin", "/welcome", "/orders", "/notifications", "/dashboard", "/request", "/subscriptions", "/onboarding/location"];
const STAFF_ROLES = new Set(["super_admin", "admin", "secretary", "cashier", "delivery_agent"]);

/** Refresh the verified Supabase session and keep staff/admin/customer route families isolated. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser verifies the cookie with Supabase; do not trust getSession or user-editable metadata.
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && isProtected) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(login);
  }

  if (!user) return response;

  // Role rows are managed server-side and are the source of truth for route boundaries.
  // Fail closed if the role lookup fails for a protected staff/admin destination.
  if (path === "/admin" || path.startsWith("/admin/") || path === "/staff" || path.startsWith("/staff/")) {
    const { data: rows, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const roles = error ? [] : (rows ?? []).map((row) => String(row.role));
    const isStaff = roles.some((role) => STAFF_ROLES.has(role));
    const isSuperAdmin = roles.includes("super_admin");

    if (path === "/admin" || path.startsWith("/admin/")) {
      if (!isSuperAdmin) {
        const destination = request.nextUrl.clone();
        destination.pathname = isStaff ? "/staff" : "/request";
        destination.search = "";
        return NextResponse.redirect(destination);
      }
    } else if (!isStaff) {
      const destination = request.nextUrl.clone();
      destination.pathname = "/request";
      destination.search = "";
      return NextResponse.redirect(destination);
    }
  }

  // Staff must not use the customer account/dashboard screens. Keep auth/security
  // destinations available because staff onboarding can require a forced password change.
  const customerOnly = [
    "/account", "/dashboard", "/orders", "/notifications", "/request", "/subscriptions",
    "/services", "/onboarding/location",
  ];
  const isCustomerRoute = customerOnly.some((p) => path === p || path.startsWith(`${p}/`));
  const isStaffOnboardingException = path === "/account/security" || path.startsWith("/account/security/");
  if (isCustomerRoute && !isStaffOnboardingException) {
    const { data: rows, error } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const roles = error ? [] : (rows ?? []).map((row) => String(row.role));
    if (error) {
      const destination = request.nextUrl.clone();
      destination.pathname = "/account/security";
      destination.search = "?forced=1";
      return NextResponse.redirect(destination);
    }
    if (roles.some((role) => STAFF_ROLES.has(role))) {
      const destination = request.nextUrl.clone();
      const isSuperAdmin = roles.includes("super_admin");
      if (isSuperAdmin) {
        destination.pathname = "/admin";
      } else {
        const { data: staffState, error: staffStateError } = await supabase.rpc("my_staff_state");
        const state = staffState as { must_change_password?: boolean; onboarding_status?: string } | null;
        if (staffStateError || !state) {
          destination.pathname = "/account/security";
          destination.search = "?forced=1";
          return NextResponse.redirect(destination);
        }
        if (state.must_change_password) {
          destination.pathname = "/account/security";
          destination.search = "?forced=1";
        } else if (state.onboarding_status === "incomplete" || state.onboarding_status === "rejected") {
          destination.pathname = "/staff/onboarding";
        } else {
          destination.pathname = "/staff";
        }
      }
      if (destination.pathname !== "/account/security") destination.search = "";
      return NextResponse.redirect(destination);
    }
  }

  // Direct visits to the generic account landing follow the same new/returning
  // customer rule as a successful login.
  if (path === "/account") {
    const { count: addressCount, error: addressError } = await supabase
      .from("addresses").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if (!addressError) {
      const destination = request.nextUrl.clone();
      destination.pathname = addressCount === 0 ? "/onboarding/location" : "/dashboard";
      destination.search = "";
      return NextResponse.redirect(destination);
    }
  }

  return response;
}
