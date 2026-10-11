export type Bucket = "core" | "gold" | "momentum" | "other";
export type InstrumentKind = "etf" | "stock" | "etc" | "fund" | "other";
export type PriceSource = "us_market" | "eodhd" | "manual";
export type TxType = "buy" | "sell" | "deposit" | "withdrawal" | "dividend" | "interest" | "fee" | "tax" | "split";

export interface Instrument {
  id: string;
  name: string;
  isin: string | null;
  kind: InstrumentKind;
  bucket: Bucket;
  currency: string;
  price_source: PriceSource;
  market_ticker: string | null;
  eodhd_symbol: string | null;
  sector: string | null;
}

export interface Transaction {
  id: string;
  instrument_id: string | null;
  type: TxType;
  trade_date: string; // YYYY-MM-DD
  quantity: number | null;
  price: number | null;
  amount: number | null;
  fees: number;
  taxes: number;
  currency: string;
  fx_rate: number; // EUR per 1 unit of `currency`
  split_ratio: number | null;
  note: string | null;
  source: "manual" | "csv";
  import_hash?: string | null;
}

export interface ManualPrice {
  id: string;
  instrument_id: string;
  price_date: string;
  price: number;
}

export interface Settings {
  targets: Record<"core" | "gold" | "momentum", number>;
  /** Products chosen for each block (lib/plan/catalog.ts); missing = recommended defaults. */
  choices?: Partial<Record<"core" | "gold" | "momentum", { isin: string; weight: number }[]>>;
  band_abs: number;
  band_rel: number;
  monthly_contribution: number;
}

export const DEFAULT_SETTINGS: Settings = {
  targets: { core: 0.75, gold: 0.1, momentum: 0.15 },
  band_abs: 0.05,
  band_rel: 0.25,
  monthly_contribution: 450,
};

export const BUCKET_LABELS: Record<Bucket | "cash", string> = {
  core: "Core",
  gold: "Diversifiers",
  momentum: "Momentum",
  other: "Other",
  cash: "Cash",
};

export const TX_LABELS: Record<TxType, string> = {
  buy: "Buy",
  sell: "Sell",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  dividend: "Dividend",
  interest: "Interest",
  fee: "Fee",
  tax: "Tax",
  split: "Split",
};
