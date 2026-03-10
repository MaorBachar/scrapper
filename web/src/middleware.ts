import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login", "/register", "/pending", "/api/auth/register"];
const AUTH_API_PATHS = ["/api/backoffice", "/api/scrape", "/api/lifecycle", "/api/runs", "/api/sms", "/api/debug", "/api/auth/me", "/api/auth/llcs", "/api/auth/switch-llc"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public auth pages and static assets
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not authenticated → redirect to login
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Check membership approval status (skip for API routes — they check internally)
  const isApiRoute = AUTH_API_PATHS.some((p) => pathname.startsWith(p));
  if (!isApiRoute) {
    const { createClient } = await import("@supabase/supabase-js");
    const adminClient = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: profile } = await adminClient
      .from("user_profiles")
      .select("is_super_admin")
      .eq("id", user.id)
      .single();

    const isSuperAdmin = profile?.is_super_admin ?? false;

    if (!isSuperAdmin) {
      const { data: membership } = await adminClient
        .from("user_llc_memberships")
        .select("status, role")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .limit(1)
        .single();

      // No approved membership → pending page (unless already there)
      if (!membership) {
        if (!pathname.startsWith("/pending")) {
          const pendingUrl = request.nextUrl.clone();
          pendingUrl.pathname = "/pending";
          return NextResponse.redirect(pendingUrl);
        }
        return response;
      }

      // Backoffice requires admin role
      if (pathname.startsWith("/backoffice") && membership.role !== "admin") {
        const homeUrl = request.nextUrl.clone();
        homeUrl.pathname = "/";
        return NextResponse.redirect(homeUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
