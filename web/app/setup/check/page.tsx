import { Wordmark } from "@/components/shell/brand";
import { runDoctor } from "@/lib/supabase/doctor";
import { appMode } from "@/lib/supabase/env";
import { AuthError, requireStore } from "@/lib/user/store";

export const metadata = { title: "Check setup" };
export const dynamic = "force-dynamic";

export default async function CheckPage() {
  // Until Supabase is configured there is nothing to protect and nobody can sign in: show
  // everything. Afterwards the full check (secret key, tables, data) needs an allowed user.
  let full = appMode() !== "supabase";
  if (!full) {
    try {
      await requireStore();
      full = true;
    } catch (e) {
      if (!(e instanceof AuthError)) throw e;
    }
  }
  const checks = await runDoctor({ full });
  const bad = checks.filter((c) => !c.ok && !c.warn);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-4 py-10">
      <Wordmark />
      <div className="card p-6">
        <h1 className="text-[20px] font-bold">{bad.length ? `${bad.length} thing(s) to fix` : "All set"}</h1>
        <p className="mt-1 text-[14px] text-ink-2">Live check of Vercel and Supabase. No key is ever shown.</p>
        <ul className="mt-5 flex flex-col gap-3">
          {checks.map((c) => (
            <li key={c.name} className="flex gap-3">
              <span aria-hidden className="mt-0.5 text-[16px]">{c.ok ? "✅" : c.warn ? "⏳" : "❌"}</span>
              <span>
                <span className="block text-[15px] font-semibold">{c.name}</span>
                <span className="block text-[14px] text-ink-2">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        {!full && (
          <p className="mt-5 text-[14px] text-ink-2">
            Showing only what sign-in needs. <a href="/login?next=/setup/check" className="font-medium text-accent">Sign in</a> to also check the secret key, the database and
            the market data.
          </p>
        )}
      </div>
      <a href="/login" className="text-center text-[15px] font-medium text-accent">Go to sign in</a>
    </main>
  );
}
