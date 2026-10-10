"use client";

import Link from "next/link";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";

import { Delta, ScoreBar, StatePill, Ticker } from "@/components/fin/fin";
import { AssetCharts } from "@/components/research/asset-charts";
import { IconArrowUpRight, IconClose, IconWatch, IconWatchFilled } from "@/components/ui/icons";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { compactUsd, num, pct, score } from "@/lib/format";
import type { AssetDetail } from "@/lib/market/types";

type Payload = { asset: AssetDetail; sessions: string[] };

const cache = new Map<string, Payload>();

async function load(t: string): Promise<Payload | null> {
  if (cache.has(t)) return cache.get(t)!;
  const r = await fetch(`/api/asset/${encodeURIComponent(t)}`);
  if (!r.ok) return null;
  const j = (await r.json()) as Payload;
  cache.set(t, j);
  return j;
}

export function QuickView({ ticker, onClose, benchmark, watched, onWatch, held }: { ticker: string | null; onClose: () => void; benchmark: string; watched: boolean; onWatch: (t: string) => void; held: boolean }) {
  const [state, setState] = useState<{ key: string; data: Payload | null; bench: Payload | null; error: boolean } | null>(null);
  const key = `${ticker}|${benchmark}`;

  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    Promise.all([load(ticker), load(benchmark)]).then(([a, b]) => {
      if (alive) setState({ key: `${ticker}|${benchmark}`, data: a, bench: b, error: !a });
    });
    return () => {
      alive = false;
    };
  }, [ticker, benchmark]);

  const current = state?.key === key ? state : null;
  const data = current?.data ?? null;
  const bench = current?.bench ?? null;
  const error = current?.error ?? false;
  const a = data?.asset;
  const r = a?.row;
  return (
    <Dialog.Root open={!!ticker} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(100vw,560px)] flex-col overflow-y-auto border-l border-line-2 bg-canvas-2 shadow-[-20px_0_60px_rgb(0_0_0/0.45)] focus:outline-none">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-canvas-2/95 px-5 py-3.5 backdrop-blur">
            <Dialog.Title className="flex min-w-0 items-center gap-2.5">
              {ticker && <Ticker t={ticker} className="text-[15px]" />}
              <span className="truncate text-[13px] font-normal text-ink-2">{r?.n}</span>
            </Dialog.Title>
            <div className="flex items-center gap-1">
              {ticker && (
                <button onClick={() => onWatch(ticker)} aria-label="Watchlist" className={watched ? "rounded p-1.5 text-accent" : "rounded p-1.5 text-ink-3 hover:text-ink"}>
                  {watched ? <IconWatchFilled size={17} /> : <IconWatch size={17} />}
                </button>
              )}
              <Dialog.Close className="rounded p-1.5 text-ink-3 hover:text-ink" aria-label="Cerrar">
                <IconClose size={17} />
              </Dialog.Close>
            </div>
          </div>
          <Dialog.Description className="sr-only">Vista rápida del activo</Dialog.Description>
          <div className="flex flex-col gap-5 px-5 py-4">
            {error && <p className="text-[13px] text-neg">No se pudo cargar el detalle.</p>}
            {!a && !error && (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-[220px] w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}
            {a && r && (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="num text-[26px] font-semibold tracking-[-0.02em]">{num(r.px)}</div>
                    <div className="flex items-center gap-2 text-[12.5px]">
                      <Delta v={r.d1} /> <span className="text-ink-3">último cierre</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {r.st && <StatePill state={r.st} />}
                    <span className="t-meta">
                      #{r.rank} · {r.sec ?? (r.cls === "etf" ? "ETF" : "Sector n/d")} {held && <Badge tone="accent" className="ml-1">En cartera</Badge>}
                    </span>
                  </div>
                </div>
                {a.series && data && (
                  <AssetCharts sessions={data.sessions} close={a.series.c} bench={bench?.asset.series?.c} benchName={benchmark} hist={a.hist} height={220} compact />
                )}
                <div className="grid grid-cols-5 gap-2 rounded-[10px] border border-line bg-surface p-3">
                  {[
                    ["Overall", r.ov, false],
                    ["Momentum", r.m, false],
                    ["Trend Q.", r.tq, false],
                    ["Accel.", r.a, false],
                    ["Risk", r.rk, true],
                  ].map(([l, v, inv]) => (
                    <div key={l as string} className="flex flex-col gap-1.5">
                      <span className="t-label truncate">{l as string}</span>
                      <span className="num text-[16px] font-semibold">{score(v as number)}</span>
                      <ScoreBar v={v as number} invert={inv as boolean} width="w-full" />
                    </div>
                  ))}
                </div>
                <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-[12.5px]">
                  {[
                    ["1m", <Delta key="1" v={r.r1m} />],
                    ["3m", <Delta key="3" v={r.r3m} />],
                    ["6m", <Delta key="6" v={r.r6m} />],
                    ["12m", <Delta key="12" v={r.r12m} />],
                    ["12-1m", <Delta key="121" v={r.r12_1} />],
                    ["Vol 63d", <span key="v" className="num">{pct(r.vol, 0, false)}</span>],
                    ["DD máx 12m", <span key="d" className="num">{pct(r.mdd, 0, false)}</span>],
                    ["Beta", <span key="b" className="num">{num(r.beta)}</span>],
                    ["Vol. $ medio", <span key="a" className="num">{compactUsd(r.adv)}</span>],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex flex-col gap-0.5">
                      <dt className="t-meta">{k as string}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                {a.report && (
                  <div className="flex flex-col gap-2">
                    <span className="t-label">Por qué está aquí</span>
                    <ul className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-ink-2">
                      {a.report.thesis.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Link href={`/research/${encodeURIComponent(r.t)}`} className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-accent hover:text-accent-2">
                  Ficha completa e informe <IconArrowUpRight size={15} />
                </Link>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
