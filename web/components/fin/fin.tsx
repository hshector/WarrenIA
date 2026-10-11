import { cx } from "@/components/ui/primitives";
import { isNum, pct } from "@/lib/format";
import { STATE_SIMPLE, type StateKey } from "@/lib/market/types";

export function Delta({ v, digits = 1, className }: { v: number | null | undefined; digits?: number; className?: string }) {
  const tone = !isNum(v) || v === 0 ? "text-ink-2" : v > 0 ? "text-pos" : "text-neg";
  return <span className={cx("num", tone, className)}>{pct(v, digits)}</span>;
}

/** Filled pill for a return (Trade Republic style). */
export function DeltaPill({ v, className }: { v: number | null | undefined; className?: string }) {
  const tone = !isNum(v) || v === 0 ? "bg-surface-2 text-ink-2" : v > 0 ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg";
  return <span className={cx("num inline-flex h-7 min-w-[72px] items-center justify-center rounded-full px-2.5 text-[13px] font-semibold", tone, className)}>{pct(v, 1)}</span>;
}

/** Simple horizontal meter 0-100 (used only inside the score breakdown). */
export function Meter({ v, invert = false, className }: { v: number | null | undefined; invert?: boolean; className?: string }) {
  const val = isNum(v) ? Math.max(0, Math.min(100, v)) : 0;
  const color = invert ? (val >= 75 ? "bg-neg" : val >= 50 ? "bg-warn" : "bg-pos") : val >= 70 ? "bg-accent" : val >= 40 ? "bg-accent/50" : "bg-ink-3/50";
  return (
    <span className={cx("relative block h-1.5 rounded-full bg-surface-3", className)} aria-hidden>
      <span className={cx("absolute inset-y-0 left-0 rounded-full", color)} style={{ width: `${val}%` }} />
    </span>
  );
}

/** Kept name for older call sites. */
export const ScoreBar = ({ v, invert, width = "w-14" }: { v: number | null | undefined; invert?: boolean; className?: string; width?: string }) => <Meter v={v} invert={invert} className={width} />;

export function ScoreCell({ v, invert = false }: { v: number | null | undefined; invert?: boolean }) {
  return <span className={cx("num font-medium", invert && isNum(v) && v >= 75 ? "text-neg" : "text-ink")}>{isNum(v) ? Math.round(v) : "—"}</span>;
}

const STATE_STYLE: Record<StateKey, string> = {
  strong: "bg-pos-soft text-pos",
  improving: "bg-accent-soft text-accent-2",
  breakout: "bg-info-soft text-info",
  extended: "bg-warn-soft text-warn",
  weakening: "bg-neg-soft text-neg",
  speculative: "bg-violet-soft text-violet",
  neutral: "bg-surface-2 text-ink-2",
};

export function StatePill({ state, className }: { state: StateKey; short?: boolean; className?: string }) {
  return <span className={cx("inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap", STATE_STYLE[state], className)}>{STATE_SIMPLE[state]}</span>;
}

export function Ticker({ t, className }: { t: string; className?: string }) {
  return <span className={cx("font-semibold tracking-[-0.01em]", className)}>{t}</span>;
}

const AVATAR = ["var(--av-1)", "var(--av-2)", "var(--av-3)", "var(--av-4)", "var(--av-5)", "var(--av-6)"];

/** Round avatar with the ticker initials (no logos: no licensed asset is assumed). */
export function AssetAvatar({ t, size = 40 }: { t: string; size?: number }) {
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-ink/75" style={{ width: size, height: size, background: AVATAR[h % AVATAR.length] }}>
      {t.slice(0, 4)}
    </span>
  );
}
