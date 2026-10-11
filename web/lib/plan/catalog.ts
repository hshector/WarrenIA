// Investable products for a Spanish resident (UCITS ETFs / ETCs listed in Europe).
// Facts verified on VERIFIED_ON against the sources listed per product; fees change,
// so the UI always shows the date and asks to check the issuer's KID before buying.
// This is data, not advice generated at runtime: every number here has a source.

import type { Bucket } from "@/lib/portfolio/types";

export const VERIFIED_ON = "2026-10-11";

export interface Product {
  isin: string;
  name: string;
  bucket: Exclude<Bucket, "other">;
  kind: "etf" | "etc";
  ter: number; // total expense ratio, fraction per year
  index: string;
  coverage: string;
  distribution: "acumulación" | "sin reparto";
  domicile: string;
  recommended?: boolean;
  pros: string[];
  cons: string[];
  sources: string[];
}

export const PRODUCTS: Product[] = [
  // ------------------------------------------------------------------ core
  {
    isin: "IE00BK5BQT80",
    name: "Vanguard FTSE All-World UCITS ETF (USD) Accumulating",
    bucket: "core",
    kind: "etf",
    ter: 0.0014,
    index: "FTSE All-World",
    coverage: "Grandes y medianas empresas de países desarrollados y emergentes",
    distribution: "acumulación",
    domicile: "Irlanda",
    recommended: true,
    pros: [
      "Todo el mercado mundial en un solo producto, incluidos los emergentes (~10 %)",
      "Comisión del 0,14 % anual tras la rebaja de julio de 2026 (antes 0,19 %)",
      "Acumula dividendos: no tributas hasta que vendes",
    ],
    cons: ["No incluye pequeñas empresas", "Como todo índice mundial, EE. UU. pesa más del 60 %"],
    sources: [
      "https://www.justetf.com/de/asset-comparisons/etf-comparisons/IE00BK5BQT80-vanguard-ftse-all-world-acc-vs-IE00BFMXXD54-vanguard-sp500-acc",
      "https://www.boerse-global.de/vanguard-ftse-all-world-etf-ter-auf-014-prozent-gesenkt/827983",
    ],
  },
  {
    isin: "IE00B4L5Y983",
    name: "iShares Core MSCI World UCITS ETF USD (Acc)",
    bucket: "core",
    kind: "etf",
    ter: 0.002,
    index: "MSCI World",
    coverage: "Unas 1.400 empresas grandes y medianas de 23 países desarrollados (sin emergentes)",
    distribution: "acumulación",
    domicile: "Irlanda",
    pros: ["El ETF mundial más grande y líquido de Europa", "Acumula dividendos"],
    cons: ["Sin mercados emergentes", "Más caro que el All-World (0,20 % frente a 0,14 %)", "Norteamérica supera el 70 %"],
    sources: ["https://www.trackingdifferences.com/ETF/ISIN/IE00B4L5Y983", "https://app.parqet.com/etf/ishares-core-msci-world-ucits-etf-usd-acc-IE00B4L5Y983"],
  },
  {
    isin: "IE00BJ0KDQ92",
    name: "Xtrackers MSCI World UCITS ETF 1C",
    bucket: "core",
    kind: "etf",
    ter: 0.0012,
    index: "MSCI World",
    coverage: "Mismo índice que el anterior (desarrollados, sin emergentes)",
    distribution: "acumulación",
    domicile: "Irlanda",
    pros: ["El MSCI World más barato de esta lista (0,12 %)"],
    cons: ["Sin mercados emergentes", "Algunas fuentes aún muestran la comisión antigua (0,19 %): compruébala en el KID"],
    sources: ["https://www.finanzfluss.de/informer/etf/IE00BJ0KDQ92/", "https://etfstream.com/etf-screener/XDWD"],
  },
  {
    isin: "IE00B3YLTY66",
    name: "SPDR MSCI ACWI IMI UCITS ETF (Acc)",
    bucket: "core",
    kind: "etf",
    ter: 0.0017,
    index: "MSCI ACWI IMI",
    coverage: "Desarrollados y emergentes, incluidas las pequeñas empresas (el más diversificado)",
    distribution: "acumulación",
    domicile: "Irlanda",
    pros: ["Incluye pequeñas empresas: el universo más amplio", "Comisión del 0,17 %"],
    cons: ["Fondo más pequeño que los anteriores", "Cambió de nombre en 2026: búscalo por ISIN"],
    sources: ["https://www.ssga.com/se/en_gb/intermediary/etfs/spdr-msci-acwi-imi-ucits-etf-acc-spyi-gy"],
  },
  // ------------------------------------------------------------------ gold
  {
    isin: "IE00B4ND3602",
    name: "iShares Physical Gold ETC",
    bucket: "gold",
    kind: "etc",
    ter: 0.0012,
    index: "Precio del oro (LBMA)",
    coverage: "Respaldado por lingotes de oro físico depositados en Londres",
    distribution: "sin reparto",
    domicile: "Irlanda",
    recommended: true,
    pros: ["Comisión del 0,12 %", "Uno de los ETC de oro más grandes de Europa", "El oro no reparte rentas: solo tributas al vender"],
    cons: ["Es un valor de deuda del emisor respaldado por oro, no un fondo", "En España tributa como rendimiento del capital mobiliario (ver Fiscalidad)"],
    sources: ["https://www.ishares.com/uk/individual/en/products/258441/ishares-physical-gold-etc-fund"],
  },
  {
    isin: "IE00B579F325",
    name: "Invesco Physical Gold ETC",
    bucket: "gold",
    kind: "etc",
    ter: 0.0012,
    index: "Precio del oro (LBMA)",
    coverage: "Lingotes de oro físico en la cámara de J.P. Morgan en Londres",
    distribution: "sin reparto",
    domicile: "Irlanda",
    pros: ["Misma comisión (0,12 %) y estructura que el de iShares: alternativa equivalente"],
    cons: ["Igual que el anterior: valor de deuda respaldado por oro"],
    sources: ["https://extraetf.com/ch/etf-profile/IE00B579F325"],
  },
  {
    isin: "DE000A0S9GB0",
    name: "Xetra-Gold",
    bucket: "gold",
    kind: "etc",
    ter: 0,
    index: "Precio del oro",
    coverage: "Bono alemán con derecho a entrega física del oro",
    distribution: "sin reparto",
    domicile: "Alemania",
    pros: ["Sin comisión de gestión del emisor; derecho a pedir la entrega del oro"],
    cons: [
      "Su gran ventaja (exento de impuestos tras un año) es de la ley ALEMANA: no se aplica a residentes en España",
      "La custodia la cobra tu bróker según su tarifa",
    ],
    sources: ["https://www.xetra-gold.com/en/product"],
  },
  // ------------------------------------------------------------------ momentum
  {
    isin: "IE00BP3QZ825",
    name: "iShares Edge MSCI World Momentum Factor UCITS ETF",
    bucket: "momentum",
    kind: "etf",
    ter: 0.0025,
    index: "MSCI World Momentum",
    coverage: "Unas 350 empresas de países desarrollados con más impulso en 6 y 12 meses (ajustado por riesgo)",
    distribution: "acumulación",
    domicile: "Irlanda",
    recommended: true,
    pros: [
      "La misma idea que el radar (momentum 6 y 12 meses ajustado por volatilidad), ya diversificada",
      "Rebalanceo dentro del fondo: tú no vendes, así que no tributas por cada rotación",
      "Ideal con aportaciones pequeñas",
    ],
    cons: ["Comisión del 0,25 %", "Rebalancea cada 6 meses: reacciona más despacio que el radar"],
    sources: ["https://www.finanzfluss.de/informer/etf/ie00bp3qz825/", "https://extraetf.com/etf-profile/IE00BP3QZ825"],
  },
];

export function productsFor(bucket: Product["bucket"]): Product[] {
  return PRODUCTS.filter((p) => p.bucket === bucket).sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended));
}

export function recommended(bucket: Product["bucket"]): Product {
  const p = PRODUCTS.find((x) => x.bucket === bucket && x.recommended);
  if (!p) throw new Error(`no recommended product for ${bucket}`);
  return p;
}

/** ISIN check digit (ISO 6166): letters -> numbers, then Luhn mod 10. */
export function isinValid(isin: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false;
  const digits = isin
    .slice(0, 11)
    .split("")
    .map((c) => (c >= "A" && c <= "Z" ? String(c.charCodeAt(0) - 55) : c))
    .join("");
  let sum = 0;
  let double = true; // rightmost digit of the payload is doubled
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10 === Number(isin[11]);
}

/**
 * Momentum sleeve: below this amount, ten equal positions would be under ~500 € each and the
 * broker's fixed fee per order weighs too much: the momentum ETF is the sensible choice.
 */
export const MIN_SLEEVE_FOR_STOCKS_EUR = 5000;
export const STOCK_POSITIONS = 10;

export function momentumRoute(sleeveValueEur: number): "etf" | "stocks" {
  return sleeveValueEur >= MIN_SLEEVE_FOR_STOCKS_EUR ? "stocks" : "etf";
}
