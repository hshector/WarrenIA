"use client";

import { useState, useTransition } from "react";

import { toggleWatch } from "@/app/(app)/actions";
import { IconWatch, IconWatchFilled } from "@/components/ui/icons";
import { Button } from "@/components/ui/primitives";

export function WatchButton({ ticker, initial }: { ticker: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(() => toggleWatch(ticker, next).then(() => undefined, () => setOn(!next)));
      }}
    >
      {on ? <IconWatchFilled size={15} className="text-accent" /> : <IconWatch size={15} />}
      {on ? "En watchlist" : "Añadir a watchlist"}
    </Button>
  );
}
