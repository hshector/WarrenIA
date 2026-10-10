import { Wordmark } from "@/components/shell/brand";

export const metadata = { title: "Configuración pendiente" };

export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4">
      <Wordmark />
      <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-6">
        <h1 className="text-[17px] font-semibold">Configuración pendiente</h1>
        <p className="t-body mt-2">
          Falta configuración de Supabase o de ALLOWED_EMAILS. Por seguridad no se muestran datos ni se permite el acceso sin autenticación.
        </p>
        <p className="t-body mt-2">
          Añade en Vercel las variables <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_URL</code>, <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>,{" "}
          <code className="font-mono text-ink">SUPABASE_SECRET_KEY</code> y <code className="font-mono text-ink">ALLOWED_EMAILS</code> (ver docs/DEPLOY.md) y vuelve a desplegar.
        </p>
        <a href="/setup/check" className="mt-4 inline-block text-[15px] font-medium text-accent">
          Comprobar qué falta
        </a>
      </div>
    </main>
  );
}
