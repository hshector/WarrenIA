import { Wordmark } from "@/components/shell/brand";
import { safeNext } from "@/lib/safe-next";
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
        <div className="card p-6">
          <h1 className="text-[24px] font-bold tracking-[-0.02em]">Entrar</h1>
          <p className="t-body mt-1 mb-5">Te enviamos un enlace a tu correo. Sin contraseñas.</p>
          {sp.error === "not_allowed" && <p className="mb-4 text-[13px] text-neg">Esta cuenta no está autorizada.</p>}
          {sp.error === "expired" && <p className="mb-4 text-[13px] text-neg">El enlace ha caducado o ya se usó. Pide uno nuevo.</p>}
          {sp.error === "link" && <p className="mb-4 text-[13px] text-neg">No se pudo validar el enlace. Pide uno nuevo y ábrelo en este mismo navegador.</p>}
          {mode === "supabase" ? (
            <LoginForm next={safeNext(sp.next)} />
          ) : (
            <p className="text-[13px] text-ink-2">
              Falta configurar Supabase. <a href="/setup/check" className="font-medium text-accent">Ver qué falta</a>
            </p>
          )}
        </div>
        <p className="t-meta mt-6">WarrenIA es una herramienta personal de análisis. No ejecuta operaciones ni ofrece asesoramiento financiero.</p>
      </div>
    </main>
  );
}
