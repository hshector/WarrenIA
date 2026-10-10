import { Wordmark } from "@/components/shell/brand";
import { appMode } from "@/lib/supabase/env";

import { LoginForm } from "./login-form";

export const metadata = { title: "Acceso" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const mode = appMode();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-8">
          <Wordmark />
        </div>
        <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-6">
          <h1 className="text-[17px] font-semibold">Accede a tu espacio</h1>
          <p className="t-body mt-1 mb-5">Te enviaremos un enlace de un solo uso. Sin contraseñas.</p>
          {sp.error === "not_allowed" && <p className="mb-4 text-[13px] text-neg">Esta cuenta no está autorizada.</p>}
          {mode === "supabase" ? (
            <LoginForm next={sp.next ?? "/"} />
          ) : (
            <p className="text-[13px] text-ink-2">El acceso requiere configurar Supabase. Consulta docs/DEPLOY.md.</p>
          )}
        </div>
        <p className="t-meta mt-6">WarrenIA es una herramienta personal de análisis. No ejecuta operaciones ni ofrece asesoramiento financiero.</p>
      </div>
    </main>
  );
}
