"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { IconRefresh } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";

type RunStatus = { configured: boolean; status?: string; conclusion?: string | null; created_at?: string; html_url?: string; message?: string };

const isRunning = (s: RunStatus | null) => s?.status === "queued" || s?.status === "in_progress";

/** Triggers the GitHub Actions data job (provider-limited, cooldown enforced server-side). */
export function RefreshButton() {
  const router = useRouter();
  const [st, setSt] = useState<RunStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [kick, setKick] = useState(0);
  const wasRunning = useRef(false);

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
        if (isRunning(j)) {
          wasRunning.current = true;
          timer = setTimeout(tick, 20_000);
        } else if (wasRunning.current) {
          wasRunning.current = false;
          router.refresh();
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

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  async function trigger() {
    const r = await fetch("/api/refresh", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(j.message ?? "No se pudo lanzar la actualización");
      return;
    }
    wasRunning.current = true;
    setMsg("Actualización en cola. Los datos de cierre se recalculan en unos minutos.");
    setTimeout(() => setKick((k) => k + 1), 4000);
  }

  const running = isRunning(st);
  const title = !st?.configured
    ? "Configura GITHUB_DISPATCH_TOKEN para lanzar actualizaciones desde la web"
    : running
      ? "Actualización en curso"
      : "Descargar el último cierre y recalcular";
  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={trigger}
        disabled={!st?.configured || running}
        title={title}
        aria-label={title}
        className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-line-2 px-2.5 text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
      >
        <IconRefresh size={15} className={cx(running && "animate-spin [animation-duration:2s]")} />
        <span className="hidden sm:inline">{running ? "Actualizando…" : "Actualizar"}</span>
      </button>
      {msg && (
        <span role="status" className="absolute right-0 top-10 z-50 w-64 rounded-[8px] border border-line-2 bg-surface-2 p-2.5 text-[12px] text-ink-2 shadow-lg">
          {msg}
        </span>
      )}
    </span>
  );
}
