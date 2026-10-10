"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { appMode, isAllowedEmail } from "@/lib/supabase/env";
import { supabaseServer } from "@/lib/supabase/server";

export type LoginState = { ok: boolean; message: string } | null;

async function origin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function sendMagicLink(_: LoginState, form: FormData): Promise<LoginState> {
  if (appMode() !== "supabase") return { ok: false, message: "El inicio de sesión requiere Supabase configurado." };
  const parsed = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!parsed.success) return { ok: false, message: "Introduce un correo válido." };
  const email = parsed.data;
  // Same answer whether or not the e-mail is allowed: the allowlist is not disclosed.
  const generic = { ok: true, message: "Si el correo está autorizado, recibirás un enlace de acceso en unos segundos." };
  if (!isAllowedEmail(email)) return generic;
  const next = String(form.get("next") || "/");
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next.startsWith("/") ? next : "/")}` },
  });
  if (error) {
    console.error("auth: signInWithOtp failed", error.status);
    return { ok: false, message: "No se pudo enviar el enlace. Inténtalo de nuevo en un minuto." };
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
