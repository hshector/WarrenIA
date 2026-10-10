import "server-only";

import { allowedEmails, supabaseBaseUrl } from "./env";

// Deployment self-check shown at /setup/check. Never returns secret values.

export type Check = { name: string; ok: boolean; detail: string; warn?: boolean };

const VERCEL_VARS = "Vercel → proyecto → Settings → Environments → Production";
const KEYS_PAGE = "Supabase → Project Settings → API Keys";

export function keyKind(key: string | undefined): "secret" | "publishable" | "service_role" | "anon" | "missing" | "unknown" {
  const k = (key ?? "").trim();
  if (!k) return "missing";
  if (k.startsWith("sb_secret_")) return "secret";
  if (k.startsWith("sb_publishable_")) return "publishable";
  if (k.startsWith("eyJ") && k.split(".").length === 3) {
    try {
      const role = JSON.parse(Buffer.from(k.split(".")[1], "base64url").toString()).role;
      return role === "service_role" || role === "anon" ? role : "unknown";
    } catch {
      return "unknown";
    }
  }
  return "unknown";
}

async function get(url: string, key: string) {
  try {
    const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return { status: r.status, text: (await r.text()).slice(0, 400) };
  } catch (e) {
    return { status: 0, text: e instanceof Error ? e.name : "error" };
  }
}

export async function runDoctor(): Promise<Check[]> {
  const out: Check[] = [];
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const pub = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const sec = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  const url = rawUrl ? supabaseBaseUrl(rawUrl) : "";
  const urlOk = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url);
  out.push({
    name: "NEXT_PUBLIC_SUPABASE_URL",
    ok: urlOk,
    detail: !rawUrl ? `Falta. Añádela en ${VERCEL_VARS} (tipo Config).` : urlOk ? "Formato correcto." : "No tiene la forma https://<ref>.supabase.co (Supabase → Project Settings → Data API → Project URL).",
  });

  const pk = keyKind(pub);
  out.push({
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ok: pk === "publishable" || pk === "anon",
    detail:
      pk === "missing"
        ? `Falta. Añádela en ${VERCEL_VARS} (tipo Config). Valor: ${KEYS_PAGE} → Publishable key.`
        : pk === "secret" || pk === "service_role"
          ? `¡Aquí has puesto la clave SECRETA! Bórrala y pon la Publishable key (${KEYS_PAGE}). Después rota la secreta en Supabase.`
          : pk === "publishable" || pk === "anon"
            ? "Es la clave pública."
            : `No parece una clave de Supabase. Valor correcto: ${KEYS_PAGE} → Publishable key.`,
  });

  const sk = keyKind(sec);
  out.push({
    name: "SUPABASE_SECRET_KEY",
    ok: sk === "secret" || sk === "service_role",
    detail:
      sk === "missing"
        ? `Falta. Añádela en ${VERCEL_VARS} (tipo Secret). Valor: ${KEYS_PAGE} → Secret keys.`
        : sk === "publishable" || sk === "anon"
          ? `Has puesto la clave pública. Aquí va la Secret key (sb_secret_…) de ${KEYS_PAGE}.`
          : sk === "secret" || sk === "service_role"
            ? "Es una clave de administrador."
            : `No parece una clave de Supabase. Valor correcto: ${KEYS_PAGE} → Secret keys.`,
  });

  const emails = allowedEmails();
  out.push({ name: "ALLOWED_EMAILS", ok: emails.length > 0, detail: emails.length ? `${emails.length} correo(s) autorizado(s).` : `Falta. Añade tu correo en ${VERCEL_VARS}.` });

  if (!urlOk) return out;

  if (pk === "publishable" || pk === "anon") {
    const r = await get(`${url}/auth/v1/settings`, pub);
    let emailOn = false;
    try {
      emailOn = Boolean(JSON.parse(r.text)?.external?.email);
    } catch {}
    out.push({
      name: "Login (Supabase Auth)",
      ok: r.status === 200 && emailOn,
      detail:
        r.status === 200
          ? emailOn
            ? "Supabase acepta la clave pública y el acceso por correo está activo."
            : "El acceso por correo está desactivado: Supabase → Authentication → Sign In / Providers → Email → activar."
          : r.status === 401 || r.status === 403
            ? `Supabase rechaza la clave pública (${r.status}). Vuelve a copiarla de ${KEYS_PAGE} → Publishable key.`
            : `Supabase respondió ${r.status || "sin conexión"}.`,
    });
  }

  if (sk === "secret" || sk === "service_role") {
    const db = await get(`${url}/rest/v1/settings?select=user_id&limit=1`, sec);
    out.push({
      name: "Base de datos",
      ok: db.status === 200,
      detail:
        db.status === 200
          ? "Tablas creadas."
          : db.status === 404 || db.text.includes("PGRST205")
            ? "Faltan las tablas: ejecuta supabase/migrations/0001_init.sql en Supabase → SQL Editor."
            : db.status === 401 || db.status === 403
              ? `Supabase rechaza la clave secreta (${db.status}). Vuelve a copiarla de ${KEYS_PAGE} → Secret keys.`
              : `Supabase respondió ${db.status || "sin conexión"}.`,
    });
    const bucket = process.env.SUPABASE_BUCKET || "market";
    const b = await get(`${url}/storage/v1/bucket/${bucket}`, sec);
    out.push({
      name: "Almacén de datos",
      ok: b.status === 200,
      detail: b.status === 200 ? `El bucket '${bucket}' existe.` : `No se encuentra el bucket '${bucket}' (${b.status}): ejecuta supabase/migrations/0001_init.sql.`,
    });
    if (b.status === 200) {
      const l = await get(`${url}/storage/v1/object/${bucket}/published/latest.json`, sec);
      out.push({
        name: "Datos de mercado",
        ok: l.status === 200,
        warn: l.status !== 200,
        detail: l.status === 200 ? "Hay datos publicados." : "Aún no hay datos: se crean cuando termina la primera descarga en GitHub Actions.",
      });
    }
  }
  return out;
}
