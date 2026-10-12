"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { IconRefresh } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";

type RunStatus = { configured: boolean; status?: string; conclusion?: string | null; created_at?: string; html_url?: string; message?: string };

const isRunning = (s: RunStatus | null) => s?.status === "queued" || s?.status === "in_progress";

/** Triggers the GitHub Actions data job (provider-limited, cooldown enforced server-side). */
export function RefreshButton() {
  const router = useRouter();
  const [st, setSt] = useState<RunStatus | null>(null);
  const [kick, setKick] = useState(0);
  const wasRunning = useRef(false);
  // When this tab dispatched a run: only that run's outcome gets a toast.
  const dispatchedAt = useRef(0);

  // Poll only while a run is queued / in progress (and once on mount).
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await fetch("/api/refresh", { cache: "no-store" });
        const j = (await r.json()) as RunStatus;
        if (!alive) return;
        setSt(j);
        // GitHub can take a few seconds to list a dispatched run: until then the latest
        // run is the previous one, which must not be reported as this one's result.
        const ours = dispatchedAt.current > 0 && !!j.created_at && Date.parse(j.created_at) >= dispatchedAt.current - 30_000;
        const waitingToAppear = dispatchedAt.current > 0 && !ours && Date.now() - dispatchedAt.current < 120_000;
        if (isRunning(j) || waitingToAppear) {
          wasRunning.current = true;
          timer = setTimeout(tick, isRunning(j) ? 20_000 : 8_000);
        } else if (wasRunning.current) {
          wasRunning.current = false;
          dispatchedAt.current = 0;
          router.refresh();
          if (ours && j.conclusion === "success") toast.success("Data updated");
          else if (ours && j.conclusion) toast.error("The update did not finish", { description: "Showing the data of the last valid close." });
        }
      } catch {
        /* keep last state */
      }
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [kick, router]);

  async function trigger() {
    const r = await fetch("/api/refresh", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error(j.message ?? "Could not start the update");
      return;
    }
    wasRunning.current = true;
    dispatchedAt.current = Date.now();
    toast("Update queued", { description: "Closing data is recalculated in a few minutes." });
    setTimeout(() => setKick((k) => k + 1), 4000);
  }

  const running = isRunning(st);
  const title = !st?.configured
    ? "Set GITHUB_DISPATCH_TOKEN to start updates from the web"
    : running
      ? "Update running"
      : "Download the latest close and recalculate";
  return (
    <button
      onClick={trigger}
      disabled={!st?.configured || running}
      title={title}
      aria-label={title}
      className="tap inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-3/70 text-ink-2 hover:text-ink disabled:opacity-40"
    >
      <IconRefresh size={16} className={cx(running && "animate-spin [animation-duration:0.9s]")} />
    </button>
  );
}
