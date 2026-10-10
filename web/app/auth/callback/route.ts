import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/safe-next";
import { supabaseServer } from "@/lib/supabase/server";

// Handles both e-mail link styles: PKCE (?code=, same browser only) and
// token_hash (?token_hash=&type=, works in any browser / the installed PWA).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const store = await cookies();
  const next = safeNext(url.searchParams.get("next") ?? store.get("wia_next")?.value);
  const sb = await supabaseServer();
  const ok = () => {
    store.delete("wia_next");
    return NextResponse.redirect(new URL(next, url.origin));
  };

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return ok();
    console.error("auth: verifyOtp failed", error.code);
  } else if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return ok();
    console.error("auth: exchangeCodeForSession failed", error.code);
  } else if (url.searchParams.get("error_code")) {
    console.error("auth: callback error", url.searchParams.get("error_code"));
  }
  // A second click on an already-used link: if the session exists, just go in.
  const { data } = await sb.auth.getUser();
  if (data.user) return ok();
  const reason = url.searchParams.get("error_code") === "otp_expired" ? "expired" : "link";
  return NextResponse.redirect(new URL(`/login?error=${reason}`, url.origin));
}
