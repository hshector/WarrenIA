import { Wordmark } from "@/components/shell/brand";

export const metadata = { title: "Setup needed" };

export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4">
      <Wordmark />
      <div className="card p-6">
        <h1 className="text-[17px] font-semibold">Setup needed</h1>
        <p className="t-body mt-2">
          Supabase or ALLOWED_EMAILS is not configured. For safety no data is shown and nobody can sign in until it is.
        </p>
        <p className="t-body mt-2">
          Add these variables in Vercel: <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_URL</code>, <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>,{" "}
          <code className="font-mono text-ink">SUPABASE_SECRET_KEY</code> and <code className="font-mono text-ink">ALLOWED_EMAILS</code> (see docs/DEPLOY.md), then redeploy.
        </p>
        <a href="/setup/check" className="mt-4 inline-block text-[15px] font-medium text-accent">
          Check what is missing
        </a>
      </div>
    </main>
  );
}
