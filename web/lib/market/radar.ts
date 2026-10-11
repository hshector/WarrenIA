// Radar query logic (pure, tested). The engine already computed every metric;
// here we only filter / sort published values — no metric is created in the UI.

import type { ActionKey, BenchReturns, RadarRow, StateKey } from "./types";

/** Plain-language risk bucket from the Risk percentile. */
export function riskLabel(rk: number | null | undefined): { text: string; cls: string } {
  if (rk === null || rk === undefined || !Number.isFinite(rk)) return { text: "—", cls: "text-ink-3" };
  if (rk < 34) return { text: "Bajo", cls: "text-pos" };
  if (rk < 67) return { text: "Medio", cls: "text-ink-2" };
  return { text: "Alto", cls: "text-neg" };
}


export type Horizon = "r1m" | "r3m" | "r6m" | "r12m";
export type PresetKey = "buy" | "all" | "wait" | "strongest" | "accel" | "lowvol" | "fading" | "breakouts" | "improvers" | "watch";

export interface Preset {
  key: PresetKey;
  label: string;
  question: string;
  note?: string;
  filter?: (r: RadarRow) => boolean;
  sort: { key: SortKey; dir: "asc" | "desc" };
}

export type SortKey = keyof RadarRow | "ret" | "rel";

export const PRESETS: Preset[] = [
  {
    key: "buy",
    label: "Para comprar",
    question: "Candidatas: entre el 20 % más fuerte, con tendencia ordenada y sin haberse disparado a corto plazo",
    filter: (r) => r.act === "candidate",
    sort: { key: "rank", dir: "asc" },
  },
  { key: "all", label: "Ranking completo", question: "Todas, ordenadas por puntuación de momentum (incluye las que no conviene comprar ahora)", sort: { key: "rank", dir: "asc" } },
  {
    key: "wait",
    label: "Esperar retroceso",
    question: "Líderes que se han disparado a corto plazo: comprarlas ahora es comprar el pico",
    filter: (r) => r.act === "wait",
    sort: { key: "rank", dir: "asc" },
  },
  { key: "strongest", label: "Más fuertes", question: "¿Qué acciones tienen el momentum más fuerte ahora?", sort: { key: "m", dir: "desc" } },
  {
    key: "accel",
    label: "Acelerando",
    question: "¿Cuáles están acelerando más durante las últimas semanas?",
    filter: (r) => r.m >= 50,
    sort: { key: "a", dir: "desc" },
  },
  {
    key: "lowvol",
    label: "Fuertes y estables",
    question: "¿Qué acciones combinan momentum fuerte con volatilidad relativamente baja?",
    filter: (r) => r.m >= 80,
    sort: { key: "rk", dir: "asc" },
  },
  {
    key: "fading",
    label: "Perdiendo fuerza",
    question: "¿Qué líderes están empezando a perder impulso?",
    filter: (r) => r.m >= 70 && (r.st === "weakening" || (r.dm !== null && r.dm <= -15)),
    sort: { key: "dm", dir: "asc" },
  },
  {
    key: "breakouts",
    label: "Rupturas",
    question: "¿Qué empresas están rompiendo máximos con confirmación de volumen?",
    note: "Con datos diarios (cierre): la confirmación es de volumen diario, no intradía.",
    filter: (r) => r.bo || (r.h52 && (r.rvol ?? 0) >= 1.5),
    sort: { key: "ov", dir: "desc" },
  },
  {
    key: "improvers",
    label: "Más mejoradas",
    question: "¿Cuáles han mejorado más su posición en el ranking durante el último mes?",
    filter: (r) => r.dr !== null,
    sort: { key: "dr", dir: "desc" },
  },
  { key: "watch", label: "Siguiendo", question: "Activos que sigues", sort: { key: "rank", dir: "asc" } },
];

export interface Filters {
  cls: "stock" | "etf";
  search: string;
  sectors: string[];
  states: StateKey[];
  actions: ActionKey[];
  onlyProfitable: boolean;
  minMcap: number;
  minAdv: number;
  maxRisk: number;
  maxVol: number;
  exchange: string;
  onlyHeld: boolean;
  onlyWatch: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  cls: "stock",
  search: "",
  sectors: [],
  states: [],
  actions: [],
  onlyProfitable: false,
  minMcap: 0,
  minAdv: 0,
  maxRisk: 100,
  maxVol: 10,
  exchange: "",
  onlyHeld: false,
  onlyWatch: false,
};

export function relReturn(r: RadarRow, h: Horizon, bench: BenchReturns, b: string): number | null {
  const a = r[h];
  const rb = bench[b]?.[h];
  if (a === null || a === undefined || rb === null || rb === undefined) return null;
  return (1 + a) / (1 + rb) - 1;
}

export function sortValue(r: RadarRow, key: SortKey, h: Horizon, bench: BenchReturns, b: string): number | string | null {
  if (key === "ret") return r[h];
  if (key === "rel") return relReturn(r, h, bench, b);
  const v = r[key as keyof RadarRow];
  return typeof v === "number" || typeof v === "string" ? v : null;
}

export function applyRadar(
  rows: RadarRow[],
  f: Filters,
  preset: Preset,
  sort: { key: SortKey; dir: "asc" | "desc" },
  ctx: { horizon: Horizon; bench: BenchReturns; benchmark: string; held: Set<string>; watch: Set<string> },
): RadarRow[] {
  const q = f.search.trim().toLowerCase();
  const out = rows.filter((r) => {
    if (r.cls !== f.cls) return false;
    if (preset.filter && !preset.filter(r)) return false;
    if (q && !r.t.toLowerCase().includes(q) && !r.n.toLowerCase().includes(q)) return false;
    if (f.sectors.length && !f.sectors.includes(r.sec ?? "—")) return false;
    if (f.states.length && !f.states.includes(r.st)) return false;
    if (f.actions.length && !f.actions.includes(r.act)) return false;
    if (f.onlyProfitable && r.prof !== true) return false;
    if (f.minMcap && !(r.mcap !== null && r.mcap >= f.minMcap)) return false;
    if (f.minAdv && !(r.adv !== null && r.adv >= f.minAdv)) return false;
    if (f.maxRisk < 100 && !(r.rk <= f.maxRisk)) return false;
    if (f.maxVol < 10 && !(r.vol !== null && r.vol <= f.maxVol)) return false;
    if (f.exchange && r.ex !== f.exchange) return false;
    if (f.onlyHeld && !ctx.held.has(r.t)) return false;
    if ((f.onlyWatch || preset.key === "watch") && !ctx.watch.has(r.t)) return false;
    return true;
  });
  const dir = sort.dir === "asc" ? 1 : -1;
  out.sort((a, b) => {
    const va = sortValue(a, sort.key, ctx.horizon, ctx.bench, ctx.benchmark);
    const vb = sortValue(b, sort.key, ctx.horizon, ctx.bench, ctx.benchmark);
    if (va === null && vb === null) return a.rank - b.rank;
    if (va === null) return 1; // missing values always last
    if (vb === null) return -1;
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return a.rank - b.rank;
  });
  return out;
}

/** Artifacts published before the action layer existed have no `act`: fall back to the full ranking. */
export function hasActions(rows: RadarRow[]): boolean {
  return rows.some((r) => typeof r.act === "string");
}

/** Plain-language verdict for an asset you already own (buffer rule of the engine). */
export function holdLabel(r: { hold: boolean }): { text: string; cls: string } {
  if (r.hold) return { text: "Mantener", cls: "text-pos" };
  return { text: "Revisar venta", cls: "text-neg" };
}
