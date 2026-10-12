import "server-only";

import { getAssets, getFx, getPriceFile } from "@/lib/market/source";
import type { Latest, Meta } from "@/lib/market/types";
import type { UserStore } from "@/lib/user/store";

import { computePortfolio, PortfolioError, type FxTable, type PortfolioResult, type PriceSeries } from "./engine";
import { rawFromAdjusted } from "./prices";
import type { Instrument, Settings, Transaction } from "./types";

export interface LoadedPortfolio {
  instruments: Instrument[];
  transactions: Transaction[];
  settings: Settings;
  result: PortfolioResult | null;
  error: string | null;
  fxAsof: string | null;
  priceInfo: Record<string, { source: string; asof: string | null }>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function loadPortfolio(store: UserStore, latest: Latest | null, meta: Meta | null): Promise<LoadedPortfolio> {
  const [instruments, transactions, settings, manual, fxFile] = await Promise.all([
    store.instruments(),
    store.transactions(),
    store.settings(),
    store.manualPrices(),
    getFx().catch(() => null),
  ]);
  const prices: Record<string, PriceSeries> = {};
  const priceInfo: LoadedPortfolio["priceInfo"] = {};

  const usTickers = instruments.filter((i) => i.price_source === "us_market" && i.market_ticker).map((i) => i.market_ticker!);
  const assets = usTickers.length ? await getAssets(latest, usTickers) : {};
  for (const ins of instruments) {
    if (ins.price_source === "us_market" && ins.market_ticker) {
      const a = assets[ins.market_ticker];
      if (a?.series && meta?.sessions) {
        prices[ins.id] = { currency: "USD", source: `Massive EOD (${ins.market_ticker})`, points: rawFromAdjusted(meta.sessions, a.series.c, a.events ?? []) };
        priceInfo[ins.id] = { source: "Cierre EE. UU. (USD) + BCE", asof: latest?.data_asof ?? null };
      }
    } else if (ins.price_source === "eodhd" && ins.eodhd_symbol) {
      const f = await getPriceFile(ins.eodhd_symbol).catch(() => null);
      if (f?.series.length) {
        prices[ins.id] = { currency: f.currency, source: f.source, points: f.series.map(([date, price]) => ({ date, price })) };
        priceInfo[ins.id] = { source: f.source, asof: f.asof };
      }
    }
    const m = manual.filter((p) => p.instrument_id === ins.id);
    if (m.length && !prices[ins.id]) {
      prices[ins.id] = { currency: ins.currency, source: "precio manual", points: m.map((p) => ({ date: p.price_date, price: p.price })).sort((a, b) => a.date.localeCompare(b.date)) };
      priceInfo[ins.id] = { source: "Manual price", asof: m[m.length - 1].price_date };
    }
  }
  const fx: FxTable = fxFile?.rates ?? {};
  let result: PortfolioResult | null = null;
  let error: string | null = null;
  try {
    result = transactions.length ? computePortfolio(instruments, transactions, prices, fx, today()) : null;
  } catch (e) {
    if (e instanceof PortfolioError) error = e.message;
    else throw e;
  }
  return { instruments, transactions, settings, result, error, fxAsof: fxFile?.asof ?? null, priceInfo };
}
