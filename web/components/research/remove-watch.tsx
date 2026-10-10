"use client";

import { useTransition } from "react";

import { toggleWatch } from "@/app/(app)/actions";
import { IconClose } from "@/components/ui/icons";

export function RemoveWatch({ ticker }: { ticker: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(() => toggleWatch(ticker, false).then(() => undefined))} aria-label={`Quitar ${ticker}`} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-40">
      <IconClose size={14} />
    </button>
  );
}
