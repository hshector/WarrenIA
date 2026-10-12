import { Wordmark } from "@/components/shell/brand";
import { runDoctor } from "@/lib/supabase/doctor";

export const metadata = { title: "Check setup" };
export const dynamic = "force-dynamic";

export default async function CheckPage() {
  const checks = await runDoctor();
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
      </div>
      <a href="/login" className="text-center text-[15px] font-medium text-accent">Go to sign in</a>
    </main>
  );
}
