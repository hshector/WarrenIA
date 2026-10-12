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
import { deflateSync, gunzipSync, gzipSync } from "node:zlib";

const src = path.resolve(process.argv[2] ?? "../data");
const out = path.resolve(process.argv[3] ?? "../data-worst");
if (!existsSync(path.join(src, "published", "latest.json"))) {
  console.error(`No market data in ${src}. Run: python -m warrenia_engine demo`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(path.join(src, "published"), path.join(out, "published"), { recursive: true });

/** Minimal valid PNG (RGB, no filter) with a centred disc, so the test sees a real image. */
function samplePng(n) {
  const crcTable = Array.from({ length: 256 }, (_, k) => {
    let c = k;
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((n * 3 + 1) * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inside = (x - n / 2) ** 2 + (y - n / 2) ** 2 < (n / 3) ** 2;
      const o = y * (n * 3 + 1) + 1 + x * 3;
      [raw[o], raw[o + 1], raw[o + 2]] = inside ? [82, 127, 98] : [255, 255, 255];
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

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
const LONG_WHY = "Strong momentum over 3, 6 and 12 months with a recent acceleration far above its sector and the benchmark index (top 1%)";
const LONG_DESC =
  "Taiwan Semiconductor Manufacturing Company Limited, together with its subsidiaries, manufactures, packages, tests and sells integrated circuits and other semiconductor devices in Taiwan, China, Europe, the Middle East, Africa, Japan, the United States and internationally. ".repeat(4);
const EXTREME_FUND = {
  available: true,
  metrics: {
    fy_end: "2025-12-31", revenue: 2.9e12, revenue_growth: 12.345, gross_margin: 0.98, operating_margin: -4.56, roa: -1.234, roe: null,
    gross_profitability: 1.5, cfo: -9.9e11, fcf: -1.2e12, accruals: 0.987, share_change: 3.21, debt_assets: 0.99, interest_coverage: -123,
    fscore: 0, zscore: -98.7, ebit_ev: 0.00001, fcf_yield: -0.5, earnings_yield: -0.3, pe: null, pb: 1234.5, shareholder_yield: 0,
    mcap: 3.48e12, net_income: -4.2e11, financial: false, debt_reported: false,
    fscore_signals: { roa_positive: false, cfo_positive: false, roa_improving: null, cash_earnings: false, leverage_not_up: false, liquidity_up: null, no_dilution: false, margin_up: true, turnover_up: false },
  },
  scores: { fund: 0.5, f_quality: 0.1, f_safety: null, f_value: 99.9 },
};

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
      if (r && patched.has(t) && r.n === STOCKS[0].n) {
        detail.profile = { description: LONG_DESC, homepage: "https://www.example.com/a/very/long/path/that/never/ends/investor-relations", employees: 76478, list_date: "1997-10-08", industry: "Semiconductors & Related Devices", fetched_at: "2026-10-01T00:00:00Z" };
        detail.fundamentals = EXTREME_FUND;
        if (detail.action) detail.action.why = [LONG_WHY, ...detail.action.why, "Dilutes shareholders: share count grew 321% last year"];
      }
    }
    writeGz(path.join(assets, f), shard);
  }
}

// Cached logo for the first rewritten stock (the web must show it), none for the rest
// (they must fall back to initials). A real PNG: a sage disc on white, 64x64.
const logoTicker = [...patched.values()].find((r) => r.cls === "stock")?.t;
if (logoTicker) {
  mkdirSync(path.join(out, "published", "logos"), { recursive: true });
  writeFileSync(path.join(out, "published", "logos", `${logoTicker}.png`), samplePng(64));
  writeFileSync(path.join(out, "published", "logos", "index.json"), JSON.stringify({ source: "worst-case", have: [logoTicker], missing: {} }));
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
  // Manual price: its long name also fills the "manual price" select (a <select> sizes to its longest option).
  ins(5, { name: "iShares Physical Gold ETC — physically backed by allocated London Good Delivery bars (USD), traded in EUR on Xetra", isin: "IE00B4ND3602", kind: "etc", bucket: "gold" }),
];
let n = 0;
const tx = (o) => ({ id: id(1000 + ++n), instrument_id: null, quantity: null, price: null, amount: null, fees: 0, taxes: 0, currency: "EUR", fx_rate: 1, split_ratio: null, note: null, source: "manual", ...o });
const transactions = [tx({ type: "deposit", trade_date: "2024-01-02", amount: 12_480_000, note: "Sale of the flat on Calle Doctor Fleming and transfer from the Banco Santander savings account (reference 0049-1500-05-2710058743)" })];
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
  settings: {
    targets: { core: 0.7, gold: 0.1, momentum: 0.15, cash: 0.05 },
    band_abs: 0.05,
    band_rel: 0.25,
    monthly_contribution: 125_000,
    // Every diversifier at once, with uneven weights.
    choices: {
      core: [{ isin: "IE00B3YLTY66", weight: 1 }],
      gold: [
        { isin: "IE00B4ND3602", weight: 0.35 },
        { isin: "LU1650487413", weight: 0.25 },
        { isin: "IE00BDFL4P12", weight: 0.2 },
        { isin: "IE00B4NCWG09", weight: 0.1 },
        { isin: "XS2940466316", weight: 0.1 },
      ],
      cash: [
        { isin: "CASH-ACCOUNT", weight: 0.5 },
        { isin: "LU0290358497", weight: 0.5 },
      ],
    },
    notify: { holdings: true, watchlist: true, candidates: true },
  },
};

// Signal log: a sell alert on a long-named holding, changes on followed stocks and many new candidates.
{
  const latestPub = JSON.parse(readFileSync(path.join(out, "published", "latest.json"), "utf8"));
  const radarW = readGz(path.join(out, "published", latestPub.path, "radar.json.gz"));
  const asof = latestPub.data_asof;
  const stocksW = radarW.rows.filter((r) => r.cls === "stock");
  const ev = (r, from, to, holdFrom, holdTo, day = asof) => ({ asof: day, t: r.t, n: r.n, from, to, hold_from: holdFrom, hold_to: holdTo, rank: r.rank, ov: r.ov, fund: r.fund ?? null });
  const events = [
    ev(top, "candidate", "avoid", true, false),
    ev(penny, "watch", "out", true, false),
    ...[...patched.keys()]
      .filter((t) => t !== top.t && t !== penny.t)
      .slice(0, 4)
      .map((t) => ev(stocksW.find((r) => r.t === t) ?? top, "watch", "candidate", true, true)),
    ...stocksW.filter((r) => !patched.has(r.t)).slice(0, 40).map((r) => ev(r, "none", "candidate", false, true)),
    ...stocksW.filter((r) => !patched.has(r.t)).slice(40, 60).map((r) => ev(r, "candidate", "wait", true, true, "2026-01-02")),
  ];
  writeFileSync(path.join(out, "published", "signals.json"), JSON.stringify({ updated_at: new Date().toISOString(), asof, events }));
}
writeFileSync(path.join(out, "user.json"), JSON.stringify(store, null, 1));
console.log(`Worst-case data in ${out} (${patched.size} rows rewritten; store: ${instruments.length} instruments, ${transactions.length} transactions)`);
