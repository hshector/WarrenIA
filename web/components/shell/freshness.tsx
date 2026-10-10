import { cx } from "@/components/ui/primitives";
import { dateLabel, dateTimeLabel } from "@/lib/format";
import type { Freshness } from "@/lib/market/freshness";
import type { Latest } from "@/lib/market/types";

const DOT = { fresh: "bg-pos", pending: "bg-info", stale: "bg-warn", unknown: "bg-ink-3" } as const;

/** Shows the date of the DATA (session close), never the time the page was opened. */
export function FreshnessStamp({ latest, fresh, compact = false }: { latest: Latest | null; fresh: Freshness | null; compact?: boolean }) {
  if (!latest) return <span className="t-meta">Sin datos publicados</span>;
  const status = latest.demo ? "unknown" : (fresh?.status ?? "unknown");
  return (
    <span className="flex min-w-0 max-w-full items-center gap-2 text-[12px] text-ink-2" title={fresh?.label}>
      <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", latest.demo ? "bg-accent" : DOT[status])} />
      <span className="min-w-0 truncate">
        <span className="text-ink">Cierre {dateLabel(latest.data_asof)}</span>
        {!compact && <span className="hidden text-ink-3 sm:inline"> · NYSE · calculado {dateTimeLabel(latest.computed_at)}</span>}
        {!compact && fresh && !latest.demo && fresh.status !== "fresh" && <span className={cx("ml-1", fresh.status === "stale" ? "text-warn" : "text-ink-3")}> · {fresh.label}</span>}
      </span>
    </span>
  );
}

export function DataBanners({ latest, fresh, warnings = [] }: { latest: Latest | null; fresh: Freshness | null; warnings?: string[] }) {
  if (!latest) return null;
  const out: React.ReactNode[] = [];
  if (latest.demo) {
    out.push(
      <div key="demo" className="flex items-center gap-2 border-b border-accent-line bg-accent-soft px-4 py-2 text-[12.5px] text-ink md:px-8">
        <span className="rounded-[4px] bg-accent px-1.5 py-px text-[10.5px] font-semibold tracking-wide text-accent-ink">DEMO</span>
        Datos sintéticos generados para desarrollo. Tickers y precios ficticios: no representan el mercado real.
      </div>,
    );
  }
  if (!latest.demo && fresh?.status === "stale") {
    out.push(
      <div key="stale" className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-[12.5px] text-ink md:px-8">
        <span className="font-medium text-warn">Datos desactualizados.</span> Los datos corresponden al cierre del {dateLabel(latest.data_asof)}; la última sesión
        cerrada es el {dateLabel(fresh.expected)}. El ranking no refleja las sesiones posteriores.
      </div>,
    );
  }
  if (latest.status === "degraded") {
    out.push(
      <div key="deg" className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-[12.5px] text-ink md:px-8">
        <span className="font-medium text-warn">Ejecución con avisos.</span> {warnings[0] ?? "Revisa Datos y ajustes para más detalle."}
      </div>,
    );
  }
  return <>{out}</>;
}
