"use client";

import { useMemo } from "react";

import { TimeSeriesChart } from "@/components/charts/time-series";
import type { DailyPoint } from "@/lib/portfolio/engine";

export function ValueChart({ series }: { series: DailyPoint[] }) {
  const specs = useMemo(
    () => [
      { kind: "area" as const, data: series.map((p) => ({ time: p.date, value: p.value })), color: "var(--accent)", width: 2, title: "Valor" },
      { kind: "line" as const, data: series.map((p) => ({ time: p.date, value: p.invested })), color: "var(--ink-3)", width: 1, dashed: true, title: "Aportado" },
    ],
    [series],
  );
  if (series.length < 2) return <div className="flex h-[240px] items-center justify-center text-[13px] text-ink-3">El histórico aparecerá a partir del segundo día con posiciones.</div>;
  return <TimeSeriesChart series={specs} height={260} ariaLabel="Valor de la cartera frente al capital aportado" />;
}
