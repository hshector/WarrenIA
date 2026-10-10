"use client";

import { useMemo, useState } from "react";

import { TimeSeriesChart, type SeriesSpec } from "@/components/charts/time-series";
import { Segmented } from "@/components/ui/primitives";
import { drawdown, relativeStrength, sliceFrom, sma, toPoints } from "@/lib/market/series";

type Tab = "price" | "rs" | "dd" | "rank";
type Range = "6m" | "1y" | "2y";
const RANGE: Record<Range, number> = { "6m": 126, "1y": 252, "2y": 504 };

export function AssetCharts({
  sessions,
  close,
  volume,
  bench,
  benchName,
  hist,
  height = 300,
  compact = false,
}: {
  sessions: string[];
  close: (number | null)[];
  volume?: (number | null)[];
  bench?: (number | null)[];
  benchName: string;
  hist?: { d: string[]; r: (number | null)[] };
  height?: number;
  compact?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("price");
  const [range, setRange] = useState<Range>("1y");
  const full = useMemo(() => toPoints(sessions, close), [sessions, close]);
  const specs: SeriesSpec[] = useMemo(() => {
    const n = RANGE[range];
    if (tab === "price") {
      const s50 = sma(full, 50);
      const s200 = sma(full, 200);
      const out: SeriesSpec[] = [
        { kind: "area", data: sliceFrom(full, n), color: "var(--ink)", width: 2, title: "" },
        { kind: "line", data: sliceFrom(s50, n), color: "var(--accent)", width: 1, title: "SMA50" },
        { kind: "line", data: sliceFrom(s200, n), color: "var(--info)", width: 1, dashed: true, title: "SMA200" },
      ];
      if (volume && !compact) out.push({ kind: "histogram", data: sliceFrom(toPoints(sessions, volume), n), color: "var(--ink-3)", scale: "volume" });
      return out;
    }
    if (tab === "rs" && bench) {
      const b = toPoints(sessions, bench);
      const rs = relativeStrength(sliceFrom(full, n), b);
      return [
        { kind: "line", data: rs, color: "var(--accent)", width: 2, priceFormat: "index", title: `vs ${benchName}` },
        { kind: "line", data: rs.map((p) => ({ time: p.time, value: 100 })), color: "var(--ink-3)", width: 1, dashed: true, priceFormat: "index" },
      ];
    }
    if (tab === "dd") {
      return [{ kind: "area", data: drawdown(sliceFrom(full, n)), color: "var(--neg)", width: 1, priceFormat: "percent" }];
    }
    if (tab === "rank" && hist) {
      // Negative ranks so that rank #1 is at the top of the chart.
      const pts = hist.d.map((d, i) => ({ time: d, value: hist.r[i] === null ? NaN : -(hist.r[i] as number) })).filter((p) => Number.isFinite(p.value));
      return [{ kind: "line", data: pts, color: "var(--accent)", width: 2, priceFormat: "rank" }];
    }
    return [];
  }, [tab, range, full, sessions, volume, bench, benchName, hist, compact]);

  const tabs: { value: Tab; label: string }[] = [
    { value: "price", label: "Precio" },
    ...(bench ? [{ value: "rs" as Tab, label: "Fuerza relativa" }] : []),
    { value: "dd", label: "Drawdown" },
    ...(hist && hist.d.length > 1 ? [{ value: "rank" as Tab, label: "Ranking" }] : []),
  ];
  const caption =
    tab === "price"
      ? "Precio ajustado por splits y dividendos · SMA50 (naranja) · SMA200 (azul, discontinua)"
      : tab === "rs"
        ? `Precio relativo frente a ${benchName}, base 100 al inicio del periodo. Sube = lo hace mejor que el benchmark.`
        : tab === "dd"
          ? "Caída desde el máximo previo del periodo mostrado."
          : "Posición en el Overall Rank recalculada con datos disponibles en cada fecha (diaria reciente, semanal antes).";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented size="sm" value={tab} onChange={setTab} options={tabs} ariaLabel="Gráfico" />
        {tab !== "rank" && <Segmented size="sm" value={range} onChange={setRange} options={[{ value: "6m", label: "6M" }, { value: "1y", label: "1A" }, { value: "2y", label: "2A" }]} ariaLabel="Periodo" />}
      </div>
      {specs.length && specs[0].data.length > 1 ? (
        <TimeSeriesChart series={specs} height={height} ariaLabel={caption} />
      ) : (
        <div className="flex items-center justify-center text-[13px] text-ink-3" style={{ height }}>
          Sin datos suficientes para este gráfico.
        </div>
      )}
      <p className="t-meta">{caption}</p>
    </div>
  );
}
