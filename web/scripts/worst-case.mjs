#!/usr/bin/env node
// Worst-case dataset for stress-testing the UI ("break-ui").
//
// Copies the DEMO market artifacts (../data) to ../data-worst, rewrites the rows that
// are on screen first with realistic worst-case values, and writes a matching local
// user store. The components are not touched: the data enters through the same
// boundary as always (WARRENIA_DATA_DIR / WARRENIA_LOCAL_STORE).
//
//   node scripts/worst-case.mjs [src=../data] [out=../data-worst]
//   npm run dev:worst
//
// Every value is something a real user or the real market can produce: long legal
// names, non-Latin names, a Berkshire-class share price, a penny stock, +1,234 % and
// −98 % returns, missing fields, an eight-figure portfolio, a 0.000123 position.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const src = path.resolve(process.argv[2] ?? "../data");
const out = path.resolve(process.argv[3] ?? "../data-worst");
if (!existsSync(path.join(src, "published", "latest.json"))) {
  console.error(`No market data in ${src}. Run: python -m warrenia_engine demo`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(path.join(src, "published"), path.join(out, "published"), { recursive: true });

const readGz = (f) => JSON.parse(gunzipSync(readFileSync(f)).toString("utf8"));
const writeGz = (f, d) => writeFileSync(f, gzipSync(JSON.stringify(d)));

// Applied in order to the best-ranked stocks / ETFs, i.e. the first rows on screen.
const STOCKS = [
  { n: "Taiwan Semiconductor Manufacturing Company Limited Sponsored ADR", px: 712345.5, mcap: 3.48e12, adv: 9.87e9, dr: 612 },
  { n: "Ollie's Bargain Outlet Holdings, Inc.", r6m: 12.345, r12m: 18.9, ytd: 11.2, d1: 0.4567, r1m: 2.1, dr: -598 },
  { n: "3M", px: 0.0123, mcap: 2.0e9, r6m: -0.987, r12m: -0.9912, d1: -0.42 },
  { n: "Compañía Española de Petróleos, S.A.U.", sec: "Information Technology Services & Consulting" },
  { n: "日本電信電話株式会社 (NTT)" },
  { n: "Pinduoduo", px: null, d1: null, r1m: null, r3m: null, r6m: null, r12m: null, ytd: null, mcap: null, sec: null, adv: null, dr: null },
];
const ETFS = [
  { n: "Xtrackers MSCI World Information Technology UCITS ETF 1C (acumulación, USD)", r6m: 4.56 },
  { n: "QQQ", d1: -0.1234 },
];
const LONG_WHY = "Momentum fuerte en 3, 6 y 12 meses con una aceleración reciente muy superior a la de su sector y al índice de referencia (p99)";

const patched = new Map(); // ticker -> patched row
const latest = JSON.parse(readFileSync(path.join(out, "published", "latest.json"), "utf8"));
for (const run of readdirSync(path.join(out, "published", "runs"))) {
  const dir = path.join(out, "published", "runs", run);
  const radarFile = path.join(dir, "radar.json.gz");
  if (!existsSync(radarFile)) continue;
  const radar = readGz(radarFile);
  const byRank = (cls) => radar.rows.filter((r) => (cls === "stock" ? r.cls === "stock" : r.cls !== "stock")).sort((a, b) => a.rank - b.rank);
  const apply = (rows, patches) =>
    patches.forEach((p, i) => {
      const r = rows[i];
      if (!r) return;
      Object.assign(r, p);
      if (i === 0) r.why = [LONG_WHY, ...r.why];
      if (path.join("runs", run) === latest.path) patched.set(r.t, r);
    });
  apply(byRank("stock"), STOCKS);
  apply(byRank("etf"), ETFS);
  writeGz(radarFile, radar);

  // Asset pages read the same row from their shard.
  const assets = path.join(dir, "assets");
  for (const f of existsSync(assets) ? readdirSync(assets) : []) {
    const shard = readGz(path.join(assets, f));
    for (const [t, detail] of Object.entries(shard)) {
      const r = radar.rows.find((x) => x.t === t);
      if (r && detail.row) detail.row = r;
    }
    writeGz(path.join(assets, f), shard);
  }
}

// ------------------------------------------------------------------ user store
const [top, , penny] = [...patched.values()].filter((r) => r.cls === "stock");
const loser = [...patched.values()].find((r) => r.n === "Ollie's Bargain Outlet Holdings, Inc.");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ins = (n, o) => ({ id: id(n), isin: null, kind: "etf", bucket: "core", currency: "EUR", price_source: "manual", market_ticker: null, eodhd_symbol: null, sector: null, ...o });
const instruments = [
  // 120 characters: the schema's maximum.
  ins(1, { name: "Xtrackers MSCI World Information Technology UCITS ETF 1C — clase acumulación USD, cubierta en EUR, negociada en Xetra", isin: "IE00BM67HT60", price_source: "eodhd", eodhd_symbol: "XDWT.XETRA" }),
  ins(2, { name: top.n, kind: "stock", bucket: "momentum", currency: "USD", price_source: "us_market", market_ticker: top.t }),
  ins(3, { name: penny.n, kind: "stock", bucket: "momentum", currency: "USD", price_source: "us_market", market_ticker: penny.t }),
  ins(4, { name: loser.n, kind: "stock", bucket: "momentum", currency: "USD", price_source: "us_market", market_ticker: loser.t }),
  ins(5, { name: "Oro", kind: "etc", bucket: "gold" }),
];
let n = 0;
const tx = (o) => ({ id: id(1000 + ++n), instrument_id: null, quantity: null, price: null, amount: null, fees: 0, taxes: 0, currency: "EUR", fx_rate: 1, split_ratio: null, note: null, source: "manual", ...o });
const transactions = [tx({ type: "deposit", trade_date: "2024-01-02", amount: 12_480_000, note: "Venta del piso de la calle Doctor Fleming y traspaso desde la cuenta de ahorro de Banco Santander (referencia 0049-1500-05-2710058743)" })];
for (let m = 0; m < 30; m++) {
  const d = new Date(Date.UTC(2024, 1 + m, 1)).toISOString().slice(0, 10);
  transactions.push(tx({ type: "deposit", trade_date: d, amount: 450 }));
}
transactions.push(
  tx({ type: "buy", trade_date: "2024-02-05", instrument_id: id(1), quantity: 214_587.3, price: 41.27, fees: 1250.5 }),
  tx({ type: "buy", trade_date: "2024-03-01", instrument_id: id(2), quantity: 17, price: top.px ?? 700, currency: "USD", fx_rate: 0.9231 }),
  tx({ type: "buy", trade_date: "2024-03-04", instrument_id: id(3), quantity: 0.000123, price: 9.99, currency: "USD", fx_rate: 0.9231 }),
  tx({ type: "buy", trade_date: "2024-04-02", instrument_id: id(4), quantity: 1, price: 9_999.99, currency: "USD", fx_rate: 0.9178 }),
  tx({ type: "buy", trade_date: "2024-05-06", instrument_id: id(5), quantity: 1, price: 2_310.4 }),
  tx({ type: "dividend", trade_date: "2024-06-14", instrument_id: id(4), amount: 0.01, currency: "USD", fx_rate: 0.93 }),
  tx({ type: "fee", trade_date: "2024-07-01", amount: 0.01 }),
);
const store = {
  instruments,
  transactions,
  manual_prices: [{ id: id(9001), instrument_id: id(5), price_date: "2026-10-01", price: 2_904.15 }],
  watchlist: [...patched.keys()].map((t) => ({ ticker: t, note: null, added_at: "2026-01-01T00:00:00Z" })),
  settings: { targets: { core: 0.75, gold: 0.1, momentum: 0.15 }, band_abs: 0.05, band_rel: 0.25, monthly_contribution: 125_000 },
};
writeFileSync(path.join(out, "user.json"), JSON.stringify(store, null, 1));
console.log(`Worst-case data in ${out} (${patched.size} rows rewritten; store: ${instruments.length} instruments, ${transactions.length} transactions)`);
