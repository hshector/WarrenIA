import { cx } from "@/components/ui/primitives";
import { isNum, pct, score } from "@/lib/format";
import { STATE_LABELS, STATE_SHORT, type StateKey } from "@/lib/market/types";

export function Delta({ v, digits = 1, className }: { v: number | null | undefined; digits?: number; className?: string }) {
  const tone = !isNum(v) || v === 0 ? "text-ink-2" : v > 0 ? "text-pos" : "text-neg";
  return <span className={cx("num", tone, className)}>{pct(v, digits)}</span>;
}

/** Percentile bar 0-100 with a tick at the median. `invert` for risk (high = bad). */
export function ScoreBar({ v, invert = false, className, width = "w-14" }: { v: number | null | undefined; invert?: boolean; className?: string; width?: string }) {
  const val = isNum(v) ? Math.max(0, Math.min(100, v)) : null;
  const strong = val !== null && (invert ? val >= 80 : val >= 80);
  const fill = invert
    ? val !== null && val >= 75
      ? "bg-neg/80"
      : "bg-ink-3/70"
    : strong
      ? "bg-[image:var(--grad-accent)]"
      : val !== null && val >= 50
        ? "bg-accent/55"
        : "bg-ink-3/60";
  return (
    <span className={cx("relative inline-block h-[3px] rounded-full bg-line-2", width, className)} aria-hidden>
      {val !== null && <span className={cx("absolute inset-y-0 left-0 rounded-full", fill)} style={{ width: `${val}%` }} />}
      <span className="absolute -top-[2px] left-1/2 h-[7px] w-px bg-ink-3/50" />
    </span>
  );
}

export function ScoreCell({ v, invert = false }: { v: number | null | undefined; invert?: boolean }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className={cx("num w-6 text-right", invert && isNum(v) && v >= 75 ? "text-neg" : "text-ink")}>{score(v)}</span>
      <ScoreBar v={v} invert={invert} width="w-10" />
    </span>
  );
}

const STATE_STYLE: Record<StateKey, { dot: string; text: string; ring: string }> = {
  strong: { dot: "bg-pos", text: "text-pos", ring: "border-pos/30" },
  improving: { dot: "bg-accent", text: "text-accent", ring: "border-accent-line" },
  breakout: { dot: "bg-info", text: "text-info", ring: "border-info/30" },
  extended: { dot: "bg-warn", text: "text-warn", ring: "border-warn/30" },
  weakening: { dot: "bg-neg", text: "text-neg", ring: "border-neg/30" },
  speculative: { dot: "bg-[#c08cf0]", text: "text-[#c9a2f2]", ring: "border-[#c08cf0]/30" },
  neutral: { dot: "bg-ink-3", text: "text-ink-2", ring: "border-line-2" },
};

export function StatePill({ state, short = false, className }: { state: StateKey; short?: boolean; className?: string }) {
  const s = STATE_STYLE[state];
  return (
    <span title={STATE_LABELS[state]} className={cx("inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-[11.5px] font-medium whitespace-nowrap", s.ring, s.text, className)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", s.dot)} />
      {short ? STATE_SHORT[state] : STATE_LABELS[state]}
    </span>
  );
}

export function StateDot({ state }: { state: StateKey }) {
  return <span title={STATE_LABELS[state]} className={cx("inline-block h-2 w-2 rounded-full", STATE_STYLE[state].dot)} />;
}

export function Ticker({ t, className }: { t: string; className?: string }) {
  return <span className={cx("font-mono text-[13px] font-medium tracking-tight text-ink", className)}>{t}</span>;
}
