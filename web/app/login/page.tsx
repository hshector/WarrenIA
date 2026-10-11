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
          <p className="t-body mt-1 mb-5">We email you a sign-in link. No passwords.</p>
          {sp.error === "not_allowed" && <p className="mb-4 text-[13px] text-neg">This account is not allowed.</p>}
          {sp.error === "expired" && <p className="mb-4 text-[13px] text-neg">The link expired or was already used. Request a new one.</p>}
          {sp.error === "link" && <p className="mb-4 text-[13px] text-neg">The link could not be validated. Request a new one and open it in this same browser.</p>}
          {mode === "supabase" ? (
            <LoginForm next={safeNext(sp.next)} />
          ) : (
            <p className="text-[13px] text-ink-2">
              Supabase is not configured yet. <a href="/setup/check" className="font-medium text-accent">See what is missing</a>
            </p>
          )}
        </div>
        <p className="t-meta mt-6">WarrenIA is a personal analysis tool. It never places trades and does not give financial advice.</p>
      </div>
    </main>
  );
}
