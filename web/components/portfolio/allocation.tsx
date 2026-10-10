import { cx } from "@/components/ui/primitives";
import { pct } from "@/lib/format";
import type { TargetRow } from "@/lib/portfolio/engine";
import { BUCKET_LABELS, type Settings } from "@/lib/portfolio/types";

/** Weight vs target with tolerance band; deviation labelled, no decorative chart. */
export function AllocationBars({ rows, settings }: { rows: TargetRow[]; settings: Settings }) {
  return (
    <div className="flex flex-col gap-4">
      {rows.map((r) => {
        const band = Math.min(settings.band_abs, r.target * settings.band_rel);
        const lo = Math.max(0, r.target - band);
        const hi = Math.min(1, r.target + band);
        return (
          <div key={r.bucket} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-ink">{BUCKET_LABELS[r.bucket]}</span>
              <span className="num text-ink-2">
                <span className="text-ink">{pct(r.weight, 1, false)}</span> <span className="text-ink-3">/ objetivo {pct(r.target, 0, false)}</span>{" "}
                <span className={cx("ml-1", r.outsideBand ? "text-warn" : "text-ink-3")}>{pct(r.deviation, 1)}</span>
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-surface-3">
              <div className="absolute inset-y-0 rounded-full bg-line-2" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} title="Banda de tolerancia" />
              <div className={cx("absolute inset-y-0 left-0 rounded-full", r.outsideBand ? "bg-warn/80" : "bg-accent/80")} style={{ width: `${Math.min(1, r.weight) * 100}%` }} />
              <div className="absolute -inset-y-1 w-px bg-ink" style={{ left: `${r.target * 100}%` }} title="Objetivo" />
            </div>
          </div>
        );
      })}
      <p className="t-meta">Pesos sobre el capital invertido (sin efectivo). Barra gris: banda de tolerancia ({pct(settings.band_abs, 0, false)} absoluta o {pct(settings.band_rel, 0, false)} relativa, la menor). Línea: objetivo.</p>
    </div>
  );
}
