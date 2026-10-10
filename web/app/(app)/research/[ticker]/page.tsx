import Link from "next/link";
import { notFound } from "next/navigation";

import { Delta, ScoreBar, StatePill, Ticker } from "@/components/fin/fin";
import { AssetCharts } from "@/components/research/asset-charts";
import { ReportSections, RuleTrace } from "@/components/research/report";
import { WatchButton } from "@/components/research/watch-button";
import { IconCompare } from "@/components/ui/icons";
import { Badge, Callout, Panel } from "@/components/ui/primitives";
import { compactUsd, dateLabel, num, pct, score } from "@/lib/format";
import { getAsset, getRadar, loadMarket } from "@/lib/market/source";
import type { Component } from "@/lib/market/types";
import { loadPortfolio } from "@/lib/portfolio/load";
import { portfolioRelevance } from "@/lib/portfolio/relevance";
import { requireStore } from "@/lib/user/store";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: decodeURIComponent(ticker).toUpperCase() };
}

const SCORE_META = [
  { key: "momentum", label: "Momentum", field: "m", desc: "Fortaleza de la tendencia: retornos 12-1 y 6-1 meses ajustados por volatilidad." },
  { key: "trend_quality", label: "Trend Quality", field: "tq", desc: "Consistencia y limpieza de la tendencia." },
  { key: "acceleration", label: "Acceleration", field: "a", desc: "Evolución reciente del impulso y de la fuerza relativa." },
  { key: "risk", label: "Risk", field: "rk", desc: "0 = menor riesgo del universo · 100 = mayor riesgo." },
] as const;

function Components({ list, invert }: { list: Component[]; invert?: boolean }) {
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="text-left text-ink-3">
          <th className="pb-1.5 font-normal">Componente</th>
          <th className="pb-1.5 text-right font-normal">Valor</th>
          <th className="pb-1.5 text-right font-normal">Percentil</th>
          <th className="pb-1.5 text-right font-normal">Peso</th>
        </tr>
      </thead>
      <tbody>
        {list.map((c) => (
          <tr key={c.key} className="border-t border-line">
            <td className="py-1.5 pr-2 text-ink-2">{c.label}</td>
            <td className="num py-1.5 text-right text-ink">{num(c.raw, Math.abs(c.raw ?? 0) >= 10 ? 1 : 3)}</td>
            <td className="py-1.5 text-right">
              <span className="inline-flex items-center gap-2">
                <span className="num">{score(c.pct)}</span>
                <ScoreBar v={c.pct} invert={invert} width="w-10" />
              </span>
            </td>
            <td className="num py-1.5 text-right text-ink-3">{Math.round(c.weight * 100)} %</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function AssetPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw).toUpperCase();
  const { latest, meta } = await loadMarket();
  const [asset, radar] = await Promise.all([getAsset(latest, ticker), getRadar(latest)]);
  if (!asset || !meta) notFound();
  const bench = await getAsset(latest, meta.primary_benchmark);
  const store = await requireStore();
  const [watch, pf] = await Promise.all([store.watchlist(), loadPortfolio(store, latest, meta)]);
  const r = asset.row;
  const n = radar?.rows.filter((x) => x.cls === r.cls).length ?? 0;
  const held = pf.result?.positions.some((p) => p.instrument.market_ticker === ticker && p.qty > 0) ?? false;

  return (
    <div className="flex flex-col gap-5">
      <nav className="t-meta">
        <Link href="/radar" className="hover:text-ink-2">
          Momentum Radar
        </Link>{" "}
        / <span className="text-ink-2">{ticker}</span>
      </nav>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Ticker t={ticker} className="text-[22px]" />
            {asset.eligible && <StatePill state={r.st} />}
            {held && <Badge tone="accent">En cartera</Badge>}
            {r.flags?.includes("ADR") && <Badge>ADR</Badge>}
          </div>
          <p className="mt-1 truncate text-[15px] text-ink-2">{r.n}</p>
          <p className="t-meta mt-1">
            {r.cls === "etf" ? "ETF" : (r.sec ?? "Sector no disponible")} · {r.ex ?? "—"} {r.mcap ? `· Cap. ${compactUsd(r.mcap)}` : ""} · Cierre {dateLabel(latest?.data_asof)}
          </p>
        </div>
        <div className="flex items-end gap-6">
          <div className="text-right">
            <div className="num text-[30px] font-semibold leading-none tracking-[-0.025em]">{num(r.px)}</div>
            <div className="mt-1.5 text-[13px]">
              <Delta v={r.d1} /> <span className="text-ink-3">· USD</span>
            </div>
          </div>
          {asset.eligible && (
            <div className="text-right">
              <div className="t-label">Rank</div>
              <div className="num text-[22px] font-semibold leading-tight">
                #{r.rank}
                <span className="text-[13px] font-normal text-ink-3"> / {n}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <WatchButton ticker={ticker} initial={watch.some((w) => w.ticker === ticker)} />
        <Link href={`/research/compare?t=${ticker},${meta.primary_benchmark}`} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line-2 px-2.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
          <IconCompare size={15} /> Comparar
        </Link>
      </div>

      {!asset.eligible && (
        <Callout tone="warn" title="Fuera del universo puntuable">
          {asset.excluded?.join(" · ") || "No cumple los filtros del universo."} Se muestran datos de precio sin puntuaciones.
        </Callout>
      )}

      {asset.eligible && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="col-span-2 flex flex-col gap-2 rounded-[var(--radius-panel)] border border-accent-line bg-[linear-gradient(160deg,var(--accent-soft),transparent_70%)] p-4 md:col-span-1">
            <span className="t-label">Overall</span>
            <span className="t-kpi text-gradient-accent">{score(r.ov)}</span>
            <ScoreBar v={r.ov} width="w-full" />
            <span className="t-meta">percentil del universo</span>
          </div>
          {SCORE_META.map((s) => (
            <div key={s.key} className="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-line bg-surface p-4" title={s.desc}>
              <span className="t-label">{s.label}</span>
              <span className={`t-kpi ${s.key === "risk" && r.rk >= 75 ? "text-neg" : ""}`}>{score(r[s.field])}</span>
              <ScoreBar v={r[s.field]} invert={s.key === "risk"} width="w-full" />
              <span className="t-meta truncate">{s.key === "risk" ? "0 = menor riesgo" : s.key === "acceleration" && r.dm !== null ? `ΔMomentum 21d: ${r.dm > 0 ? "+" : ""}${Math.round(r.dm)}` : "percentil"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Precio y tendencia">
            {asset.series ? (
              <AssetCharts sessions={meta.sessions} close={asset.series.c} volume={asset.series.v} bench={bench?.series?.c} benchName={meta.primary_benchmark} hist={asset.hist} />
            ) : (
              <p className="t-body">Sin serie de precios publicada.</p>
            )}
          </Panel>
          <Panel title="Rentabilidad" meta="Precio ajustado por splits y dividendos (rentabilidad total si hay dividendos disponibles)" pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead>
                  <tr className="text-right text-[11px] uppercase tracking-[0.05em] text-ink-3">
                    <th className="px-4 py-2 text-left font-medium md:px-5"> </th>
                    {["1m", "3m", "6m", "12m", "YTD"].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-line">
                    <td className="px-4 py-2 text-ink md:px-5">{ticker}</td>
                    {[r.r1m, r.r3m, r.r6m, r.r12m, r.ytd].map((v, i) => (
                      <td key={i} className="px-3 py-2 text-right">
                        <Delta v={v} />
                      </td>
                    ))}
                  </tr>
                  {radar &&
                    Object.keys(meta.benchmarks).map((b) => {
                      const br = radar.bench[b];
                      if (!br) return null;
                      return (
                        <tr key={b} className="border-t border-line">
                          <td className="px-4 py-2 text-ink-3 md:px-5">
                            {ticker} vs {b}
                          </td>
                          {(["r1m", "r3m", "r6m", "r12m", "ytd"] as const).map((h) => {
                            const a = r[h];
                            const bv = br[h];
                            const rel = a !== null && a !== undefined && bv !== null && bv !== undefined ? (1 + a) / (1 + bv) - 1 : null;
                            return (
                              <td key={h} className="px-3 py-2 text-right">
                                <Delta v={rel} />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Panel>
          {asset.report && <ReportSections report={asset.report} relevance={portfolioRelevance(r, pf.result, pf.instruments, pf.settings)} />}
        </div>

        <div className="flex flex-col gap-4">
          {asset.state && (
            <Panel title="Clasificación" meta="Reglas explícitas evaluadas en esta ejecución">
              <RuleTrace trace={asset.state.trace} state={asset.state.state} />
            </Panel>
          )}
          {asset.components &&
            SCORE_META.map((s) => (
              <Panel key={s.key} title={`${s.label} · ${score(r[s.field])}`} meta={s.desc}>
                <Components list={asset.components![s.key]} invert={s.key === "risk"} />
              </Panel>
            ))}
          {asset.indicators && (
            <Panel title="Indicadores clave">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
                {[
                  ["Precio vs SMA20", pct(asset.indicators.px_vs_sma20 as number)],
                  ["Precio vs SMA50", pct(asset.indicators.px_vs_sma50 as number)],
                  ["Precio vs SMA100", pct(asset.indicators.px_vs_sma100 as number)],
                  ["Precio vs SMA200", pct(asset.indicators.px_vs_sma200 as number)],
                  ["ATR14 / precio", pct(asset.indicators.atr_pct as number, 2, false)],
                  ["ATRs sobre SMA50", num(asset.indicators.atr_above_sma50 as number, 1)],
                  ["Volumen relativo", `${num(asset.indicators.rel_volume as number, 2)}x`],
                  ["Gaps > 2 ATR (6m)", pct(asset.indicators.gap_freq as number, 0, false)],
                  ["Pendiente tendencia (anual.)", pct(asset.indicators.trend_slope_126 as number, 0)],
                  ["Liderazgo (residual)", num(asset.indicators.residual_mom as number, 2)],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col">
                    <dt className="t-meta">{k}</dt>
                    <dd className="num text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          )}
          {asset.events && asset.events.length > 0 && (
            <Panel title="Eventos corporativos (2 años)" meta="Usados para ajustar el precio">
              <ul className="flex flex-col gap-1 text-[12.5px] text-ink-2">
                {asset.events.slice(-8).map(([d, f, kind, detail]) => (
                  <li key={d + kind} className="flex justify-between">
                    <span>{dateLabel(d)}</span>
                    <span className="num text-ink-3">{kind === "split" ? `Split ${detail}` : `Dividendo ${detail} $ (factor ${f.toFixed(4)})`}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
