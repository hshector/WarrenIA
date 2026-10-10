import type { RadarRow } from "@/lib/market/types";

import type { PortfolioResult } from "./engine";
import type { Instrument, Settings } from "./types";

/** "Portfolio relevance" lines for an asset report. Only statements backed by data. */
export function portfolioRelevance(row: RadarRow, res: PortfolioResult | null, instruments: Instrument[], settings: Settings): string[] {
  if (!res || res.totals.value <= 0) return ["No hay cartera registrada: registra tus operaciones para ver el encaje de este activo."];
  const out: string[] = [];
  const pos = res.positions.find((p) => p.instrument.market_ticker === row.t && p.qty > 0);
  if (pos) {
    out.push(`Ya en cartera: ${(100 * (pos.weight ?? 0)).toFixed(1).replace(".", ",")} % del valor total (${pos.instrument.name}).`);
  } else {
    out.push("No está en tu cartera.");
  }
  if (row.sec) {
    const sectorW = res.positions
      .filter((p) => p.instrument.kind === "stock" && p.instrument.sector === row.sec && p.weight)
      .reduce((s, p) => s + (p.weight ?? 0), 0);
    out.push(
      `Exposición directa actual al sector ${row.sec} (acciones individuales): ${(100 * sectorW).toFixed(1).replace(".", ",")} %.` +
        (pos ? "" : " Añadirla aumentaría esa exposición."),
    );
  }
  const etfs = instruments.filter((i) => i.kind === "etf" && res.positions.some((p) => p.instrument.id === i.id && p.qty > 0));
  if (etfs.length) {
    out.push(
      `Posible solapamiento con ${etfs.map((e) => e.name).join(", ")}: no se dispone de la composición del ETF con fecha y fuente verificables, así que la exposición indirecta no se calcula.`,
    );
  }
  const mom = res.allocation.find((a) => a.bucket === "momentum");
  const invested = res.allocation.filter((a) => a.bucket !== "cash").reduce((s, a) => s + a.value, 0);
  const w = invested > 0 && mom ? mom.value / invested : 0;
  out.push(`Bloque acciones/momentum: ${(100 * w).toFixed(1).replace(".", ",")} % de lo invertido frente a un objetivo del ${(100 * settings.targets.momentum).toFixed(0)} %.`);
  return out;
}
