"use client";

import { useMemo } from "react";

import { TimeSeriesChart } from "@/components/charts/time-series";
import type { DailyPoint } from "@/lib/portfolio/engine";

export function ValueChart({ series }: { series: DailyPoint[] }) {
  const specs = useMemo(
    () => [
      { kind: "area" as const, data: series.map((p) => ({ time: p.date, value: p.value })), color: "var(--accent)", width: 2 },
      { kind: "line" as const, data: series.map((p) => ({ time: p.date, value: p.invested })), color: "var(--ink-3)", width: 1, dashed: true },
    ],
    [series],
  );
  if (series.length < 2) return <p className="py-8 text-center text-[14px] text-ink-3">El gráfico aparecerá a partir del segundo día.</p>;
  return (
    <>
      <TimeSeriesChart series={specs} height={200} ariaLabel="Valor de la cartera frente a lo aportado" />
      <p className="mt-2 text-[12.5px] text-ink-3">Línea discontinua: dinero aportado.</p>
    </>
  );
}
