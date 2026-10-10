// Which auth / persistence mode the app runs in.
//  supabase      : production — Supabase Auth + Postgres with RLS
//  local         : development on your machine only (JSON file, no login); never on Vercel
//  misconfigured : deployed without Supabase — the app refuses to show data (fail closed)

export type AppMode = "supabase" | "local" | "misconfigured";

export function supabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export function appMode(): AppMode {
  if (supabasePublicEnv()) return "supabase";
  if (!process.env.VERCEL && (process.env.NODE_ENV !== "production" || process.env.WARRENIA_LOCAL_MODE === "1")) return "local";
  return "misconfigured";
}

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  const list = allowedEmails();
  if (!email) return false;
  // With Supabase configured an empty allowlist means nobody is allowed (fail closed).
  return list.includes(email.toLowerCase());
}
