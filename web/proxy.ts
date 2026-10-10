import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { appMode, isAllowedEmail, supabasePublicEnv } from "@/lib/supabase/env";

// Optimistic auth gate. Authoritative checks also happen in every server action /
// route handler (requireUser) and in Postgres via RLS.

const PUBLIC = ["/login", "/auth/", "/setup", "/manifest.webmanifest", "/sw.js", "/icons/", "/offline"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p));
  const mode = appMode();

  if (mode === "local") return NextResponse.next();
  if (mode === "misconfigured") {
    if (isPublic) return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  let response = NextResponse.next({ request });
  const env = supabasePublicEnv()!;
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  // Redirects must carry any auth cookies Supabase just set or cleared.
  const redirect = (to: URL) => {
    const r = NextResponse.redirect(to);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };
  if (!user && !isPublic) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return redirect(url);
  }
  if (user && !isAllowedEmail(user.email) && !isPublic) {
    await supabase.auth.signOut();
    return redirect(new URL("/login?error=not_allowed", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webp)$).*)"],
};
