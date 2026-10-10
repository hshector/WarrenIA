// Number formatting (es-ES conventions, tabular-friendly). Never invent a value:
// null / undefined / NaN render as an em dash.

const DASH = "—";

export function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function pct(v: number | null | undefined, digits = 1, sign = true): string {
  if (!isNum(v)) return DASH;
  const s = new Intl.NumberFormat("es-ES", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: sign ? "exceptZero" : "auto",
  }).format(v);
  return s.replace(/ %/, " %");
}

export function num(v: number | null | undefined, digits = 2): string {
  if (!isNum(v)) return DASH;
  return new Intl.NumberFormat("es-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

export function int(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(v);
}

export function money(v: number | null | undefined, currency = "EUR", digits = 2): string {
  if (!isNum(v)) return DASH;
  return new Intl.NumberFormat("es-ES", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

export function compactUsd(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  const a = Math.abs(v);
  if (a >= 1e12) return `${num(v / 1e12, 2)} B$`;
  if (a >= 1e9) return `${num(v / 1e9, 1)} mil M$`;
  if (a >= 1e6) return `${num(v / 1e6, 0)} M$`;
  return `${int(v)} $`;
}

export function score(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  return Math.round(v).toString();
}

export function signClass(v: number | null | undefined): string {
  if (!isNum(v) || v === 0) return "text-ink-2";
  return v > 0 ? "text-pos" : "text-neg";
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

/** "9 oct 2026" from an ISO date (YYYY-MM-DD), no timezone shifts. */
export function dateLabel(iso: string | null | undefined, withYear = true): string {
  if (!iso) return DASH;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return DASH;
  return withYear ? `${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`;
}

/** Local date-time for timestamps (computed_at etc.), explicit timezone. */
export function dateTimeLabel(iso: string | null | undefined, tz = "Europe/Madrid"): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  }).format(d);
}
