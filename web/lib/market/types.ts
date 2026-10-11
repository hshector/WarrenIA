// Types of the artifacts published by the Python engine (engine/warrenia_engine/publish.py).
// Field names are short on purpose (radar.json can hold thousands of rows).

export type AssetClass = "stock" | "etf";
export type StateKey = "speculative" | "extended" | "weakening" | "breakout" | "strong" | "improving" | "neutral";
export type ActionKey = "candidate" | "wait" | "watch" | "avoid" | "none";

export interface Latest {
  schema: number;
  run_id: string;
  data_asof: string; // YYYY-MM-DD session date of the data
  session_close_utc: string | null;
  computed_at: string;
  demo: boolean;
  status: "ok" | "degraded";
  provider: string;
  path: string;
}

export interface RadarRow {
  t: string; // ticker
  n: string; // name
  cls: AssetClass;
  ex: string | null;
  sec: string | null;
  mcap: number | null;
  px: number | null;
  d1: number | null;
  r1m: number | null;
  r3m: number | null;
  r6m: number | null;
  r12m: number | null;
  ytd: number | null;
  r12_1: number | null;
  vol: number | null;
  atr: number | null;
  mdd: number | null;
  dd: number | null;
  beta: number | null;
  d52: number | null;
  adv: number | null;
  rvol: number | null;
  s50: number | null;
  s200: number | null;
  m: number; // Momentum Score
  tq: number; // Trend Quality
  a: number; // Acceleration
  rk: number; // Risk (0 = lowest risk)
  ov: number; // Overall score
  rank: number;
  dr: number | null; // rank change over 21 sessions (positive = improved)
  dm: number | null; // Momentum percentile change over 21 sessions
  lead: number | null; // residual momentum
  secrel: number | null; // 6m return relative to sector ETF
  st: StateKey;
  pst: StateKey | null; // state in previous run
  tags: StateKey[];
  why: string[];
  flags: string[];
  bo: boolean;
  h52: boolean;
  act: ActionKey; // what to do now (engine rules: scoring.decide)
  hold: boolean; // if already owned: keep (true) or review a sale (false)
  pe: number | null; // P/E on last annual net income (stocks; null if loss-making or unknown)
  prof: boolean | null; // profitable in the last fiscal year (null = unknown)
}

export type BenchReturns = Record<string, { d1?: number | null; r1m: number | null; r3m: number | null; r6m: number | null; r12m: number | null; ytd?: number | null }>;

export interface Radar {
  asof: string;
  bench: BenchReturns;
  rows: RadarRow[];
}

export interface Component {
  key: string;
  label: string;
  weight: number;
  raw: number | null;
  pct: number | null;
}

export interface RuleCondition {
  text: string;
  value: number | boolean | null;
  op: string;
  threshold: number | boolean;
  pass: boolean;
}

export interface Report {
  ticker: string;
  name: string;
  cls: AssetClass;
  state: StateKey;
  state_label: string;
  thesis: string[];
  evidence: { label: string; value: string; context: string }[];
  risks: string[];
  invalidation: string[];
  data_quality: { source: string; asof: string; history_sessions: number; missing_frac: number | null; total_return: boolean; notes: string[] };
  disclaimer: string;
  rank?: number;
  action?: ActionKey;
  action_label?: string;
  action_why?: string[];
  entry?: string | null;
}

export interface ActionDecision {
  action: ActionKey;
  label: string;
  why: string[];
  entry: string | null;
  hold: boolean;
}

export interface AssetDetail {
  row: RadarRow;
  eligible: boolean;
  excluded?: string[];
  indicators?: Record<string, number | boolean | null>;
  components?: Record<"momentum" | "trend_quality" | "acceleration" | "risk", Component[]>;
  state?: { state: StateKey; tags: StateKey[]; trace: Record<string, RuleCondition[]> };
  action?: ActionDecision;
  report?: Report;
  hist?: { d: string[]; r: (number | null)[]; o: (number | null)[] };
  series?: { c: (number | null)[]; v: (number | null)[] };
  events?: [string, number, "split" | "dividend", string][];
}

export interface Coverage {
  candidates: number;
  eligible: number;
  excluded_by_reason: Record<string, number>;
}

export interface Meta {
  schema: number;
  run_id: string;
  data_asof: string;
  session_close_utc: string;
  computed_at: string;
  expected_last_session: string;
  demo: boolean;
  provider: string;
  total_return: boolean;
  status: "ok" | "degraded";
  warnings: string[];
  git_sha: string | null;
  data_window: { first_session: string; last_session: string; sessions: number; plan_limited_before: string | null };
  lake: { refreshed: Record<string, string>; ingested_sessions: number };
  data_type: string;
  coverage: Record<AssetClass, Coverage>;
  benchmarks: Record<string, string>;
  primary_benchmark: string;
  sector_etfs: Record<string, string>;
  states: Record<StateKey, string>;
  actions?: Record<ActionKey, string>;
  sessions: string[];
  calendar?: { exchange: string; sessions: [string, string][] };
  methodology: {
    version: string;
    config_hash: string;
    scores: Record<string, Record<string, number>>;
    overall: Record<string, number>;
    classification: Record<string, Record<string, number>>;
    windows: Record<string, number>;
    labels: Record<string, string>;
    universe: string;
    universe_rules: Record<string, Record<string, unknown>>;
  };
  sensitivity: null | {
    samples: number;
    concentration: number;
    top_n: number;
    spearman: { median: number; p05: number };
    topn_overlap: { median: number; p05: number; min: number };
    target_median_topn_overlap: number;
    passes_target: boolean;
  };
  correlation: null | { labels: string[]; matrix: (number | null)[][]; threshold: number; high_pairs: { a: string; b: string; rho: number }[] };
  reports: Record<AssetClass, Report[]>;
  compute_seconds?: number;
}

export interface Market {
  asof: string;
  breadth: { above_sma50?: number; above_sma200?: number; new_52w_high?: number; median_r3m?: number; n?: number };
  states: Record<AssetClass, Partial<Record<StateKey, number>>>;
  sectors: { sector: string; etf: string; r1m: number | null; r3m: number | null; r6m: number | null; r12m: number | null; rs_slope_21: number | null; strength: number | null; in_top50: number; eligible: number }[];
  benchmarks: Record<string, { price: number | null; px_vs_sma50: number | null; px_vs_sma200: number | null; vol_63: number | null; dd_now: number | null; d1?: number | null; r1m: number | null; r3m: number | null; r6m: number | null; r12m: number | null }>;
  primary: string;
}

export interface Excluded {
  t: string;
  n: string;
  cls: AssetClass;
  reasons: string[];
  codes: string[];
  px: number | null;
  adv: number | null;
}

export interface Backtest {
  status: string;
  conclusive?: boolean;
  demo?: boolean;
  message?: string;
  computed_at?: string;
  data_asof?: string;
  period?: { first_signal: string; last_signal: string; end: string; rebalances: number; years: number };
  settings?: Record<string, string | number>;
  strategies?: Record<string, string>;
  results?: Record<string, Record<string, number | null | Record<string, { days: number; ann_return: number | null }>>>;
  sector_exposure_overall?: Record<string, number>;
  curves?: { dates: string[]; series: Record<string, (number | null)[]> };
  limitations?: string[];
}

export interface FxFile {
  base: "EUR";
  asof: string | null;
  source: string;
  rates: Record<string, [string, number][]>;
}

export interface PriceFile {
  symbol: string;
  currency: string;
  source: string;
  asof: string | null;
  series: [string, number][];
}

export const STATE_LABELS: Record<StateKey, string> = {
  strong: "Strong Uptrend",
  improving: "Improving Momentum",
  breakout: "Early Breakout",
  extended: "Extended / Overheated",
  weakening: "Weakening Momentum",
  speculative: "High Volatility / Speculative",
  neutral: "Neutral",
};

export const STATE_SHORT: Record<StateKey, string> = {
  strong: "Strong",
  improving: "Improving",
  breakout: "Breakout",
  extended: "Extended",
  weakening: "Weakening",
  speculative: "Speculative",
  neutral: "Neutral",
};

/** Plain-language labels used in the interface. */
export const STATE_SIMPLE: Record<StateKey, string> = {
  strong: "Tendencia fuerte",
  improving: "Mejorando",
  breakout: "Ruptura",
  extended: "Sobreextendida",
  weakening: "Perdiendo fuerza",
  speculative: "Muy volátil",
  neutral: "Sin señal clara",
};

/** One-sentence explanation of each state for non-experts. */
export const STATE_EXPLAIN: Record<StateKey, string> = {
  strong: "Sube de forma sostenida, por encima de sus medias y cerca de máximos.",
  improving: "Su impulso está mejorando frente al resto del mercado.",
  breakout: "Acaba de superar sus máximos recientes con volumen. Falta confirmación.",
  extended: "Tendencia fuerte, pero el precio se ha alejado mucho de su media.",
  weakening: "Era una líder y está perdiendo impulso.",
  speculative: "Movimientos muy bruscos: riesgo elevado.",
  neutral: "No cumple las reglas de ninguna categoría concreta.",
};

/** What to do with an asset now (engine: scoring.decide). */
export const ACTION_LABELS: Record<ActionKey, string> = {
  candidate: "Candidata",
  wait: "Esperar retroceso",
  watch: "Vigilar",
  avoid: "Evitar",
  none: "Sin señal",
};

export const ACTION_EXPLAIN: Record<ActionKey, string> = {
  candidate: "Entre el 20 % más fuerte, con tendencia ordenada y sin haberse disparado: se puede comprar ahora.",
  wait: "Tendencia fuerte, pero se ha disparado a corto plazo. Comprar ahora es comprar el pico: mejor esperar a que se modere.",
  watch: "Interesante, pero todavía no es una compra: falta confirmación, fuerza o beneficios.",
  avoid: "Sin momentum, demasiado volátil o perdiendo fuerza. No es para comprar; si la tienes, revisa la venta.",
  none: "No tiene una señal de momentum clara.",
};
