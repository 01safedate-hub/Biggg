import {NextRequest, NextResponse} from 'next/server';
import {createServerSupabase} from './lib/supabase/server';
import type {CookieOptions} from '@supabase/ssr';

const ADMIN_LOGIN_PATH = '/admin/login';
const ADMIN_BASE = '/admin';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow the login page through
  if (pathname === ADMIN_LOGIN_PATH) return NextResponse.next();

  // Only protect /admin routes
  if (!pathname.startsWith(ADMIN_BASE)) return NextResponse.next();

  // Create a response we can mutate (so cookie set/delete operations are preserved)
  let response = NextResponse.next();

  // Build the cookie accessors expected by @supabase/ssr (getAll / setAll)
  const cookieAccessors = {
    getAll: () => {
      return req.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
    },
    setAll: (cookiesToSet: Array<{name: string; value: string; options?: CookieOptions}>) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
    },
  };

  // Create server supabase client using the shared helper
  const supabase = createServerSupabase({
    cookies: cookieAccessors,
  });

  try {
    // Validate the session first — getUser() refreshes tokens and sets
    // refreshed cookies on the response via the cookie accessors above.
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      const redirectUrl = new URL(ADMIN_LOGIN_PATH, req.url);
      redirectUrl.searchParams.set('error', 'session');
      return NextResponse.redirect(redirectUrl);
    }

    // Now check the admin role via the RPC
    const { data, error } = await supabase.rpc('is_admin');

    const isAdmin = !!(data as any);

    if (!isAdmin || error) {
      const redirectUrl = new URL(ADMIN_LOGIN_PATH, req.url);
      redirectUrl.searchParams.set('error', 'unauthorized');
      return NextResponse.redirect(redirectUrl);
    }

    // User is admin; return the (possibly mutated) response so any refresh cookies are included
    return response;
  } catch (err) {
    // On unexpected errors, redirect to login as a safe default
    const redirectUrl = new URL(ADMIN_LOGIN_PATH, req.url);
    redirectUrl.searchParams.set('error', 'session');
    return NextResponse.redirect(redirectUrl);
  }
}

export const config = {
  // Match all /admin routes; login is allowed through above logic
  matcher: ['/admin/:path*'],
};
