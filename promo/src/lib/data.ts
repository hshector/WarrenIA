// Demo figures only. Everything here is synthetic and shown on screen as such.
// Names and tickers come from the engine's fake market (`python -m warrenia_engine demo`).

/** 24 months of monthly contributions: 2.000 € to start, then 450 €/month. */
const MONTHS = 24;
const START = 2000;
const MONTHLY = 450;
export const CONTRIBUTED = START + (MONTHS - 1) * MONTHLY; // 12.350 €
export const VALUE = 13842.6;
export const GAIN = VALUE - CONTRIBUTED;
export const GAIN_PCT = (GAIN / CONTRIBUTED) * 100;

/** Weekly points: contributed (step) and value (contributed × (1 + r)). */
export const portfolio = (() => {
  const n = MONTHS * 4;
  const out: { contributed: number; value: number }[] = [];
  const endR = VALUE / CONTRIBUTED - 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const month = Math.min(MONTHS - 1, Math.floor(i / 4));
    const contributed = START + month * MONTHLY;
    // Rising drift with a mid-period drawdown and a little weekly texture.
    const drift = endR * Math.pow(t, 1.25);
    const dip = -0.045 * Math.exp(-Math.pow((t - 0.52) / 0.07, 2));
    const wobble = 0.012 * Math.sin(t * 31) * (1 - t) + 0.006 * Math.sin(t * 83 + 1);
    const r = i === n ? endR : drift + dip + wobble;
    out.push({ contributed, value: contributed * (1 + r) });
  }
  return out;
})();

export const stats = [
  { k: "TIR", v: "+9,4 %" },
  { k: "TWR", v: "+8,7 %" },
  { k: "Desviación", v: "1,8 pp" },
];

export const mixRows = [
  { k: "Núcleo global", pct: 73, target: 75, color: "salvia" },
  { k: "Diversificadores", pct: 11, target: 10, color: "gold" },
  { k: "Momentum", pct: 16, target: 15, color: "violet" },
] as const;

export const planRows = [
  { k: "Núcleo global", sub: "ETF mundial", amount: 338, color: "salvia" },
  { k: "Diversificadores", sub: "Oro", amount: 45, color: "gold" },
  { k: "Momentum", sub: "ETF momentum mundial", amount: 67, color: "violet" },
] as const;

/** 20-year projection in today's euros, 450 €/month: p10 / p50 / p90. */
export const projection = (() => {
  const years = 20;
  const pts: { y: number; p10: number; p50: number; p90: number }[] = [];
  for (let y = 0; y <= years; y++) {
    const fv = (r: number) => {
      const m = r / 12;
      const n = y * 12;
      return m === 0 ? MONTHLY * n : MONTHLY * ((Math.pow(1 + m, n) - 1) / m);
    };
    const base = VALUE * 0;
    pts.push({ y, p10: base + fv(0.012), p50: base + fv(0.038), p90: base + fv(0.062) });
  }
  return pts;
})();

export const radarRows = [
  { t: "X615", name: "Demo Energy 615", score: 100, av: 0, seed: 3 },
  { t: "X682", name: "Demo Materials 682", score: 100, av: 2, seed: 7 },
  { t: "X134", name: "Demo Consumer 134", score: 99, av: 4, seed: 11 },
  { t: "X097", name: "Demo Energy 097", score: 99, av: 1, seed: 17 },
];

export const radarFactors = [
  { k: "Tendencia 12 m", v: 96 },
  { k: "Aceleración 3 m", v: 88 },
  { k: "Estabilidad", v: 74 },
  { k: "Solidez financiera", v: 81 },
];

/** Upward but bumpy 12-month line, normalised 0..1. */
export const spark = (seed: number, n = 26) =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return 0.12 + 0.7 * Math.pow(t, 1.3) + 0.07 * Math.sin(t * (9 + seed) + seed) + 0.04 * Math.sin(t * 23 + seed * 2);
  });

// Before you sell: 20 of 25 units of Demo Energy 615 at 71 €, fee 1 €.
// Lot bought at 62 € + 1 € fee (0,04 €/unit). Same figures the app returns in demo mode.
export const sell = {
  name: "Demo Energy 615",
  t: "X615",
  units: 20,
  held: 25,
  price: 71,
  fee: 1,
  lotPrice: 62,
  proceeds: 20 * 71 - 1, // 1.419,00
  cost: 1240.8,
  gain: 178.2,
  tax: 33.86,
  receive: 1385.14,
};
