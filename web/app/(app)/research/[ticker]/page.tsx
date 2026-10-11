import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionPill, AssetAvatar, Delta, Meter, StatePill } from "@/components/fin/fin";
import { AssetCharts, RankChart } from "@/components/research/asset-charts";
import { RuleTrace } from "@/components/research/report";
import { WatchButton } from "@/components/research/watch-button";
import { IconChevronDown } from "@/components/ui/icons";
import { Callout, Card, EmptyState } from "@/components/ui/primitives";
import { compactUsd, dateLabel, num, pct } from "@/lib/format";
import { holdLabel, riskLabel } from "@/lib/market/radar";
import { getAsset, getRadar, loadMarket } from "@/lib/market/source";
import { ACTION_EXPLAIN, STATE_EXPLAIN, type Component } from "@/lib/market/types";
import { loadPortfolio } from "@/lib/portfolio/load";
import { portfolioRelevance } from "@/lib/portfolio/relevance";
import { requireStore } from "@/lib/user/store";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: decodeURIComponent(ticker).toUpperCase() };
}

const SCORES = [
  { key: "momentum", field: "m", label: "Fuerza de tendencia", help: "Cuánto ha subido en 6 y 12 meses, ajustado por su volatilidad." },
  { key: "trend_quality", field: "tq", label: "Calidad de la tendencia", help: "Si sube de forma constante y ordenada." },
  { key: "acceleration", field: "a", label: "Aceleración", help: "Si el impulso está creciendo en las últimas semanas." },
] as const;

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-line first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <IconChevronDown size={18} className="text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}

function ComponentsTable({ list }: { list: Component[] }) {
  return (
    <table className="w-full text-[13.5px]">
      <tbody>
        {list.map((c) => (
          <tr key={c.key} className="border-t border-line first:border-t-0">
            <td className="py-2 pr-3 text-ink-2">{c.label}</td>
            <td className="num py-2 text-right">{num(c.raw, Math.abs(c.raw ?? 0) >= 10 ? 1 : 3)}</td>
            <td className="num w-16 py-2 text-right text-ink-3">p{c.pct === null ? "—" : Math.round(c.pct)}</td>
            <td className="num w-12 py-2 text-right text-ink-3">{Math.round(c.weight * 100)}%</td>
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
  if (!meta)
    return (
      <EmptyState title="Todavía no hay datos de mercado">
        <p>Aparecerán cuando termine la primera descarga diaria.</p>
      </EmptyState>
    );
  if (!asset) notFound();
  const bench = await getAsset(latest, meta.primary_benchmark);
  const store = await requireStore();
  const [watch, pf] = await Promise.all([store.watchlist(), loadPortfolio(store, latest, meta)]);
  const r = asset.row;
  const total = radar?.rows.filter((x) => x.cls === r.cls).length ?? 0;
  const rep = asset.report;
  const risk = riskLabel(r.rk);
  const act = asset.action;
  const owned = pf.result?.positions.some((p) => p.instrument.market_ticker === ticker && p.qty > 0) ?? false;
  const hold = act ? holdLabel(act) : null;

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4">
      <Link href="/radar" className="text-[15px] font-medium text-accent">
        ‹ Radar
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <AssetAvatar t={ticker} size={52} />
          <div className="min-w-0">
            <h1 className="line-clamp-3 text-[22px] font-bold leading-tight tracking-[-0.02em] sm:text-[24px]">{r.n}</h1>
            <p className="text-[14px] text-ink-2">
              {ticker} · {r.cls === "etf" ? "ETF" : (r.sec ?? "Acción")}
            </p>
          </div>
        </div>
        <WatchButton ticker={ticker} initial={watch.some((w) => w.ticker === ticker)} />
      </div>

      <div>
        <div className="num text-[40px] font-bold leading-tight tracking-[-0.03em]">{num(r.px)} $</div>
        <p className="text-[14px] text-ink-2">
          <Delta v={r.d1} className="font-semibold" /> hoy · cierre del {dateLabel(latest?.data_asof)}
        </p>
      </div>

      {asset.eligible && act && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px] text-ink-2">Qué hacer ahora</p>
            <ActionPill action={act.action} className="h-8 px-3.5 text-[14px]" />
          </div>
          <p className="mt-3 text-[15px] leading-relaxed">{ACTION_EXPLAIN[act.action]}</p>
          {act.why.length > 0 && (
            <div className="mt-3">
              <Bullets items={act.why} />
            </div>
          )}
          {act.entry && <p className="mt-3 rounded-[14px] bg-warn-soft px-4 py-3 text-[14.5px]">{act.entry}</p>}
          {hold && (
            <p className="mt-3 text-[14.5px] text-ink-2">
              {owned ? "La tienes en cartera: " : "Si la tuvieras: "}
              <span className={`font-semibold ${hold.cls}`}>{hold.text}</span>
              {act.hold
                ? " (sigue en la mitad más fuerte del universo y sin señal de evitar)."
                : " (ha salido de la mitad más fuerte del universo o tiene señal de evitar)."}
            </p>
          )}
          {r.cls === "stock" && (
            <p className="mt-3 text-[14px] text-ink-2">
              Valoración:{" "}
              {r.prof === false ? (
                <span className="font-semibold text-neg">pérdidas en el último ejercicio</span>
              ) : r.pe !== null && r.pe !== undefined ? (
                <span className={`font-semibold ${r.pe >= 60 ? "text-warn" : "text-ink"}`}>PER {num(r.pe, 1)}</span>
              ) : (
                <span className="font-semibold">beneficio no disponible</span>
              )}
              <span className="text-ink-3"> · informativo, no entra en la puntuación</span>
            </p>
          )}
        </Card>
      )}

      <Card>
        {asset.series ? <AssetCharts sessions={meta.sessions} close={asset.series.c} bench={bench?.series?.c} benchName={meta.primary_benchmark} /> : <p className="text-ink-3">Sin serie de precios.</p>}
      </Card>

      {!asset.eligible ? (
        <Callout tone="warn" title="Sin puntuación">
          No entra en el universo analizado: {asset.excluded?.join(" · ").toLowerCase() || "no cumple los filtros"}.
        </Callout>
      ) : (
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[14px] text-ink-2">Puntuación de momentum</p>
              <p className="num mt-1 text-[44px] font-bold leading-none tracking-[-0.03em]">
                {Math.round(r.ov)}
                <span className="text-[18px] font-semibold text-ink-3">/100</span>
              </p>
              <p className="mt-2 text-[14px] text-ink-2">
                Puesto {r.rank} de {total}
              </p>
            </div>
            <StatePill state={r.st} className="mt-1" />
          </div>
          <p className="mt-4 rounded-[14px] bg-surface-2 px-4 py-3 text-[14.5px] text-ink">{STATE_EXPLAIN[r.st]}</p>
          <div className="mt-5 flex flex-col gap-4">
            {SCORES.map((s) => (
              <div key={s.key}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[15px]" title={s.help}>
                    {s.label}
                  </span>
                  <span className="num text-[15px] font-semibold">{Math.round(r[s.field])}</span>
                </div>
                <Meter v={r[s.field]} />
              </div>
            ))}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[15px]">Riesgo</span>
                <span className={`text-[15px] font-semibold ${risk.cls}`}>{risk.text}</span>
              </div>
              <Meter v={r.rk} invert />
            </div>
          </div>
        </Card>
      )}

      <Card title="Rentabilidad">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["1 mes", r.r1m],
              ["3 meses", r.r3m],
              ["6 meses", r.r6m],
              ["1 año", r.r12m],
            ] as const
          ).map(([l, v]) => (
            <div key={l} className="rounded-[14px] bg-surface-2 px-3 py-3 text-center">
              <p className="text-[12.5px] text-ink-2">{l}</p>
              <Delta v={v} className="whitespace-nowrap text-[17px] font-semibold" />
            </div>
          ))}
        </div>
        {radar?.bench[meta.primary_benchmark] && (
          <p className="mt-3 text-[13.5px] text-ink-2">
            Frente a {meta.primary_benchmark} en 6 meses:{" "}
            <Delta
              v={r.r6m !== null && radar.bench[meta.primary_benchmark].r6m !== null ? (1 + r.r6m) / (1 + (radar.bench[meta.primary_benchmark].r6m as number)) - 1 : null}
              className="font-semibold"
            />
          </p>
        )}
      </Card>

      {rep && (
        <>
          <Card title="Por qué destaca">
            <Bullets items={rep.thesis.slice(0, 1)} />
          </Card>
          <Card title="Riesgos">
            <Bullets items={rep.risks} />
          </Card>
          <Card title="Qué vigilar" sub="Señales que debilitarían la tendencia">
            <Bullets items={rep.invalidation} />
          </Card>
          <Card title="En tu cartera">
            <Bullets items={portfolioRelevance(r, pf.result, pf.instruments, pf.settings)} />
          </Card>
        </>
      )}

      <section className="card overflow-hidden">
        <h2 className="px-5 pb-1 pt-5 text-[17px] font-semibold">Detalle técnico</h2>
        <p className="px-5 pb-2 text-[13.5px] text-ink-2">Para quien quiera ver cómo se calcula todo.</p>
        {asset.state && (
          <Fold title="Por qué tiene este estado">
            <RuleTrace trace={asset.state.trace} state={asset.state.state} />
          </Fold>
        )}
        {asset.components && (
          <Fold title="Componentes de cada puntuación">
            <div className="flex flex-col gap-5">
              {(["momentum", "trend_quality", "acceleration", "risk"] as const).map((k) => (
                <div key={k}>
                  <p className="mb-1 text-[14px] font-semibold">{{ momentum: "Fuerza de tendencia", trend_quality: "Calidad de la tendencia", acceleration: "Aceleración", risk: "Riesgo (0 = menor)" }[k]}</p>
                  <ComponentsTable list={asset.components![k]} />
                </div>
              ))}
            </div>
          </Fold>
        )}
        {rep && (
          <Fold title="Todos los datos">
            <dl className="divide-y divide-line">
              {rep.evidence.map((e) => (
                <div key={e.label} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-[14px] text-ink-2">{e.label}</dt>
                  <dd className="num text-[14px] sm:text-right">
                    {e.value}
                    {e.context && <span className="block text-[12.5px] text-ink-3">{e.context}</span>}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between py-2.5 text-[14px]">
                <dt className="text-ink-2">Capitalización</dt>
                <dd className="num">{compactUsd(r.mcap)}</dd>
              </div>
              <div className="flex justify-between py-2.5 text-[14px]">
                <dt className="text-ink-2">Volatilidad 63 días</dt>
                <dd className="num">{pct(r.vol, 0, false)}</dd>
              </div>
            </dl>
          </Fold>
        )}
        {asset.hist && asset.hist.d.length > 1 && (
          <Fold title="Evolución en el ranking">
            <RankChart hist={asset.hist} />
          </Fold>
        )}
        {rep && (
          <Fold title="Calidad de los datos">
            <ul className="flex flex-col gap-1.5 text-[14px] text-ink-2">
              <li>Fuente: {rep.data_quality.source} · cierre del {dateLabel(rep.data_quality.asof)}</li>
              <li>{rep.data_quality.history_sessions} sesiones de historia</li>
              {rep.data_quality.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
              {(asset.events ?? []).slice(-5).map(([d, , kind, detail]) => (
                <li key={d + kind}>
                  {kind === "split" ? `Split ${detail}` : `Dividendo ${detail} $`} el {dateLabel(d)}
                </li>
              ))}
            </ul>
          </Fold>
        )}
      </section>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[12.5px] text-ink-3">Análisis cuantitativo de precios. No es una recomendación.</p>
        <Link href={`/research/compare?t=${ticker},${meta.primary_benchmark}`} className="shrink-0 text-[14px] font-medium text-accent">
          Comparar
        </Link>
      </div>
    </div>
  );
}
