import type { DailyPoint } from "@/lib/portfolio/engine";

/** Bare value line for the home card: no axes, no labels, no JS. Drawn in the
 *  card's ink so it works on the pastel hero in light and dark. */
export function Sparkline({ series, className }: { series: DailyPoint[]; className?: string }) {
  if (series.length < 2) return null;
  // ~120 points is plenty for a 360px-wide line and keeps the HTML small.
  const step = Math.max(1, Math.ceil(series.length / 120));
  const pts = series.filter((_, i) => i % step === 0 || i === series.length - 1).map((p) => p.value);
  const min = Math.min(...pts);
  const span = Math.max(...pts) - min || 1;
  const W = 100;
  const H = 40;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 2 - ((v - min) / span) * (H - 6)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className={className}>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${W},${H}L0,${H}Z`} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
