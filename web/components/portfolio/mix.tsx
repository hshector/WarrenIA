import type { ReactNode } from "react";

import { BUCKET_DOT } from "@/components/plan/product";
import { cx } from "@/components/ui/primitives";
import { pct } from "@/lib/format";
import type { TargetRow } from "@/lib/portfolio/engine";
import { BUCKET_LABELS } from "@/lib/portfolio/types";

/** Small figure with a short label: three fit across a phone. */
export function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[12.5px] text-ink-2">{label}</dt>
      <dd className="num whitespace-nowrap text-[17px] font-semibold">{value}</dd>
    </div>
  );
}

/** Current mix as one stacked bar, then one line per block: weight, target and an
 *  arrow when it is outside its band. Replaces one bar + sentence per block. */
export function MixBar({ dev }: { dev: TargetRow[] }) {
  const total = dev.reduce((t, d) => t + d.weight, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label="Current mix">
        {dev.map((d) => (
          <div key={d.bucket} className={BUCKET_DOT[d.bucket]} style={{ width: `${(d.weight / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {dev.map((d) => (
          <li key={d.bucket} className="flex items-center gap-2.5 text-[15px]">
            <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", BUCKET_DOT[d.bucket])} />
            <span className="min-w-0 flex-1 truncate">{BUCKET_LABELS[d.bucket]}</span>
            {d.outsideBand && (
              <span className="shrink-0 text-[13px] font-medium text-warn" title={d.deviation > 0 ? "Above target" : "Below target"}>
                {d.deviation > 0 ? "▲" : "▼"}
              </span>
            )}
            <span className="num shrink-0 whitespace-nowrap">
              <span className="font-semibold">{pct(d.weight, 0, false)}</span>
              <span className="text-ink-3"> / {pct(d.target, 0, false)}</span>
            </span>
          </li>
        ))}
      </ul>
      {dev.some((d) => d.outsideBand) && <p className="mt-3 text-[13px] text-ink-3">▲▼ off target: next month&apos;s contribution evens it out.</p>}
    </div>
  );
}
