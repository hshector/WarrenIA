"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeNext } from "@/lib/safe-next";
import { allowedEmails, appMode, isAllowedEmail } from "@/lib/supabase/env";
import { supabaseServer } from "@/lib/supabase/server";

export type LoginState = { ok: boolean; message: string } | null;

async function origin() {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    try {
      return new URL(site.includes("://") ? site : `https://${site}`).origin;
    } catch {
      /* fall through to the request host */
    }
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function otpError(code: string | undefined, status: number | undefined): string {
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || status === 429)
    return "Supabase limits repeated emails. Wait a minute and request the link once.";
  if (code === "email_provider_disabled" || code === "signup_disabled")
    return "Email sign-in is disabled in Supabase (Authentication → Sign In / Providers → Email).";
  if (status === 401 || status === 403 || code === "invalid_api_key" || code === "no_api_key")
    return "Supabase rejects Vercel's public key. Check the setup at /setup/check.";
  return `Could not send the link (${code ?? status ?? "error"}). Check the setup at /setup/check.`;
}

export async function sendMagicLink(_: LoginState, form: FormData): Promise<LoginState> {
  if (appMode() !== "supabase") return { ok: false, message: "Sign-in needs Supabase to be configured." };
  const parsed = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!parsed.success) return { ok: false, message: "Enter a valid email." };
  const email = parsed.data;
  // Same answer whether or not the e-mail is allowed: the allowlist is not disclosed.
  const generic = { ok: true, message: "If the email is allowed, a sign-in link will arrive in a few seconds." };
  if (!allowedEmails().length) console.error("auth: ALLOWED_EMAILS is empty — nobody can sign in");
  if (!isAllowedEmail(email)) return generic;
  // `next` travels in a cookie so the redirect URL is exactly /auth/callback (Supabase allowlist match).
  (await cookies()).set("wia_next", safeNext(String(form.get("next") || "/")), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 3600, path: "/" });
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await origin()}/auth/callback` },
  });
  if (error) {
    console.error("auth: signInWithOtp failed", error.status, error.code);
    return { ok: false, message: otpError(error.code, error.status) };
  }
  return generic;
}

export async function signOut() {
  if (appMode() === "supabase") {
    const sb = await supabaseServer();
    await sb.auth.signOut();
  }
  redirect("/login");
}
