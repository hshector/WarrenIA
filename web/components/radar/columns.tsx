import { Delta, ScoreCell, StatePill, Ticker } from "@/components/fin/fin";
import { cx } from "@/components/ui/primitives";
import { compactUsd, isNum, num, pct } from "@/lib/format";
import { relReturn, type Horizon, type SortKey } from "@/lib/market/radar";
import type { BenchReturns, RadarRow } from "@/lib/market/types";

export interface ColCtx {
  horizon: Horizon;
  bench: BenchReturns;
  benchmark: string;
  held: Set<string>;
  watch: Set<string>;
  twoLine?: boolean;
}

export interface Col {
  id: string;
  label: string;
  title?: string;
  width: number;
  align?: "left" | "right";
  sort?: SortKey;
  sticky?: boolean;
  render: (r: RadarRow, c: ColCtx) => React.ReactNode;
}

const H_LABEL: Record<Horizon, string> = { r1m: "1m", r3m: "3m", r6m: "6m", r12m: "12m" };

function RankDelta({ v }: { v: number | null }) {
  if (!isNum(v) || v === 0) return <span className="text-ink-3">·</span>;
  return <span className={cx("num text-[12px]", v > 0 ? "text-pos" : "text-neg")}>{v > 0 ? `▲${v}` : `▼${-v}`}</span>;
}

export const COLS: Record<string, Col> = {
  rank: { id: "rank", label: "#", width: 46, align: "right", sort: "rank", render: (r) => <span className="num text-ink-2">{r.rank}</span> },
  dr: { id: "dr", label: "Δ21", title: "Cambio de posición en el ranking en 21 sesiones", width: 52, align: "right", sort: "dr", render: (r) => <RankDelta v={r.dr} /> },
  name: {
    id: "name",
    label: "Activo · razones principales",
    width: 260,
    sort: "t",
    sticky: true,
    render: (r, c) => (
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-baseline gap-2">
          <Ticker t={r.t} className="w-[52px] shrink-0" />
          <span className="truncate text-[12.5px] text-ink-2">{r.n}</span>
          {c.held.has(r.t) && <span title="En cartera" className="shrink-0 rounded-[4px] bg-accent-soft px-1 text-[10px] font-medium text-accent">CARTERA</span>}
        </span>
        {c.twoLine && r.why.length > 0 && (
          <span className="truncate pl-[60px] text-[11.5px] leading-4 text-ink-3" title={r.why.join(" · ")}>
            {r.why.join(" · ")}
          </span>
        )}
      </span>
    ),
  },
  st: { id: "st", label: "Estado", width: 120, render: (r) => <StatePill state={r.st} short /> },
  px: { id: "px", label: "Precio", width: 78, align: "right", sort: "px", render: (r) => <span className="num text-ink">{num(r.px)}</span> },
  d1: { id: "d1", label: "1d", width: 64, align: "right", sort: "d1", render: (r) => <Delta v={r.d1} /> },
  ret: { id: "ret", label: "Ret.", width: 72, align: "right", sort: "ret", render: (r, c) => <Delta v={r[c.horizon]} /> },
  rel: { id: "rel", label: "vs bench", width: 78, align: "right", sort: "rel", render: (r, c) => <Delta v={relReturn(r, c.horizon, c.bench, c.benchmark)} /> },
  r1m: { id: "r1m", label: "1m", width: 66, align: "right", sort: "r1m", render: (r) => <Delta v={r.r1m} /> },
  r3m: { id: "r3m", label: "3m", width: 66, align: "right", sort: "r3m", render: (r) => <Delta v={r.r3m} /> },
  r6m: { id: "r6m", label: "6m", width: 70, align: "right", sort: "r6m", render: (r) => <Delta v={r.r6m} /> },
  r12m: { id: "r12m", label: "12m", width: 74, align: "right", sort: "r12m", render: (r) => <Delta v={r.r12m} /> },
  ytd: { id: "ytd", label: "YTD", width: 68, align: "right", sort: "ytd", render: (r) => <Delta v={r.ytd} /> },
  r12_1: { id: "r12_1", label: "12-1m", title: "Retorno de 12 meses excluyendo el último mes", width: 74, align: "right", sort: "r12_1", render: (r) => <Delta v={r.r12_1} /> },
  ov: { id: "ov", label: "Overall", width: 92, align: "right", sort: "ov", render: (r) => <ScoreCell v={r.ov} /> },
  m: { id: "m", label: "Momentum", width: 92, align: "right", sort: "m", render: (r) => <ScoreCell v={r.m} /> },
  tq: { id: "tq", label: "Trend Q.", title: "Trend Quality", width: 88, align: "right", sort: "tq", render: (r) => <ScoreCell v={r.tq} /> },
  a: { id: "a", label: "Accel.", title: "Acceleration Score", width: 88, align: "right", sort: "a", render: (r) => <ScoreCell v={r.a} /> },
  rk: { id: "rk", label: "Risk", title: "Risk Score: 0 = menor riesgo del universo, 100 = mayor", width: 88, align: "right", sort: "rk", render: (r) => <ScoreCell v={r.rk} invert /> },
  dm: { id: "dm", label: "ΔMom", title: "Cambio del percentil de Momentum en 21 sesiones", width: 64, align: "right", sort: "dm", render: (r) => <span className={cx("num", isNum(r.dm) && r.dm > 0 ? "text-pos" : isNum(r.dm) && r.dm < 0 ? "text-neg" : "text-ink-3")}>{isNum(r.dm) ? `${r.dm > 0 ? "+" : ""}${Math.round(r.dm)}` : "—"}</span> },
  lead: { id: "lead", label: "Liderazgo", title: "Momentum residual tras descontar la beta al mercado (z)", width: 82, align: "right", sort: "lead", render: (r) => <span className={cx("num", isNum(r.lead) && r.lead > 0 ? "text-ink" : "text-ink-3")}>{num(r.lead, 2)}</span> },
  vol: { id: "vol", label: "Vol 63d", width: 70, align: "right", sort: "vol", render: (r) => <span className="num text-ink-2">{pct(r.vol, 0, false)}</span> },
  atr: { id: "atr", label: "ATR%", width: 62, align: "right", sort: "atr", render: (r) => <span className="num text-ink-2">{pct(r.atr, 1, false)}</span> },
  mdd: { id: "mdd", label: "DD máx", title: "Drawdown máximo 12 meses", width: 70, align: "right", sort: "mdd", render: (r) => <span className="num text-ink-2">{pct(r.mdd, 0, false)}</span> },
  dd: { id: "dd", label: "DD act.", title: "Caída desde el máximo de 12 meses", width: 66, align: "right", sort: "dd", render: (r) => <span className="num text-ink-2">{pct(r.dd, 1, false)}</span> },
  beta: { id: "beta", label: "Beta", width: 56, align: "right", sort: "beta", render: (r) => <span className="num text-ink-2">{num(r.beta, 2)}</span> },
  d52: { id: "d52", label: "vs máx 52s", width: 80, align: "right", sort: "d52", render: (r) => <span className="num text-ink-2">{isNum(r.d52) ? pct(-r.d52, 1) : "—"}</span> },
  adv: { id: "adv", label: "Vol. $ medio", width: 92, align: "right", sort: "adv", render: (r) => <span className="num text-ink-2">{compactUsd(r.adv)}</span> },
  mcap: { id: "mcap", label: "Capitaliz.", width: 92, align: "right", sort: "mcap", render: (r) => <span className="num text-ink-2">{compactUsd(r.mcap)}</span> },
  sec: { id: "sec", label: "Sector", width: 150, sort: "sec", render: (r) => <span className="truncate text-[12.5px] text-ink-2">{r.sec ?? "—"}</span> },
  why: { id: "why", label: "Razones principales", width: 300, render: (r) => <span className="truncate text-[12.5px] text-ink-2">{r.why.join(" · ") || "—"}</span> },
};

export type ColumnPreset = "compact" | "returns" | "scores" | "risk";

export const COLUMN_PRESETS: Record<ColumnPreset, { label: string; cols: string[] }> = {
  compact: { label: "Compacto", cols: ["rank", "dr", "name", "st", "px", "d1", "ret", "rel", "ov", "m", "rk"] },
  returns: { label: "Retornos", cols: ["rank", "name", "px", "d1", "r1m", "r3m", "r6m", "r12m", "ytd", "r12_1", "rel", "sec"] },
  scores: { label: "Scores", cols: ["rank", "dr", "name", "st", "ov", "m", "tq", "a", "rk", "dm", "lead", "sec"] },
  risk: { label: "Riesgo", cols: ["rank", "name", "rk", "vol", "atr", "mdd", "dd", "beta", "d52", "adv", "mcap"] },
};

export function horizonLabel(h: Horizon) {
  return H_LABEL[h];
}
