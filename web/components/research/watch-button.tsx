"use client";

import { useState, useTransition } from "react";

import { toggleWatch } from "@/app/(app)/actions";
import { cx } from "@/components/ui/primitives";

export function WatchButton({ ticker, initial }: { ticker: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      aria-pressed={on}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(() => toggleWatch(ticker, next).then(() => undefined, () => setOn(!next)));
      }}
      className={cx("h-9 shrink-0 rounded-full px-4 text-[14px] font-semibold transition-colors", on ? "bg-surface-3 text-ink" : "bg-accent text-white hover:bg-accent-2")}
    >
      {on ? "Siguiendo" : "Seguir"}
    </button>
  );
}
