import Link from "next/link";

import { Delta, StatePill } from "@/components/fin/fin";
import { AllocationBars } from "@/components/portfolio/allocation";
import { ContributionPlanner, InstrumentForm, TransactionForm } from "@/components/portfolio/forms";
import { ValueChart } from "@/components/portfolio/value-chart";
import { PageHeader } from "@/components/shell/page-header";
import { IconUpload } from "@/components/ui/icons";
import { Badge, ButtonLink, Callout, EmptyState, Panel, Stat } from "@/components/ui/primitives";
import { dateLabel, money, num, pct } from "@/lib/format";
import { getRadar, loadMarket } from "@/lib/market/source";
import { targetDeviation } from "@/lib/portfolio/engine";
import { loadPortfolio } from "@/lib/portfolio/load";
import { BUCKET_LABELS } from "@/lib/portfolio/types";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const { latest, meta } = await loadMarket();
  const store = await requireStore();
  const [pf, radar] = await Promise.all([loadPortfolio(store, latest, meta), getRadar(latest)]);
  const res = pf.result;
  const rowsBy = new Map((radar?.rows ?? []).map((r) => [r.t, r]));
  const actions = (
    <>
      <ButtonLink href="/portfolio/import">
        <IconUpload size={16} /> Importar CSV
      </ButtonLink>
      <ButtonLink href="/portfolio/transactions">Operaciones</ButtonLink>
      <InstrumentForm />
      <TransactionForm instruments={pf.instruments} />
    </>
  );

  if (pf.error) {
    return (
      <>
        <PageHeader title="Portfolio" actions={actions} />
        <Callout tone="neg" title="Las operaciones registradas no son coherentes">
          {pf.error} Revisa la lista de operaciones.
        </Callout>
      </>
    );
  }
  if (!res) {
    return (
      <>
        <PageHeader title="Portfolio" sub="Valor, rentabilidad y riesgo de tu cartera a partir de tus operaciones registradas." actions={actions} />
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState title="Empieza tu cartera">
            <ol className="mt-1 flex list-decimal flex-col gap-1.5 pl-4">
              <li>Añade los instrumentos que vayas a usar (ETF MSCI World, oro, acciones) e indica a qué bloque de tu estrategia pertenecen.</li>
              <li>Registra cada aportación de dinero al bróker y cada compra, con su comisión.</li>
              <li>WarrenIA calcula valor, TWR, TIR y la desviación frente a tus pesos objetivo.</li>
            </ol>
          </EmptyState>
          <Panel title="Reparto de tu próxima aportación" meta={`Objetivos: ${Object.entries(pf.settings.targets).map(([k, v]) => `${BUCKET_LABELS[k as "core"]} ${pct(v, 0, false)}`).join(" · ")}`}>
            <ContributionPlanner values={{ core: 0, gold: 0, momentum: 0 }} other={0} settings={pf.settings} />
          </Panel>
        </div>
      </>
    );
  }
  const t = res.totals;
  const dev = targetDeviation(res, pf.settings);
  const values = Object.fromEntries(dev.map((d) => [d.bucket, d.value])) as Record<"core" | "gold" | "momentum", number>;
  const other = res.allocation.find((a) => a.bucket === "other")?.value ?? 0;
  const held = res.positions.filter((p) => p.qty > 1e-9);
  const momentumHoldings = held.filter((p) => p.instrument.market_ticker && rowsBy.has(p.instrument.market_ticker));

  return (
    <>
      <PageHeader title="Portfolio" sub={<>Valorado a {dateLabel(res.asOf)} · precios EOD por instrumento · tipos de cambio BCE {pf.fxAsof ? `(${dateLabel(pf.fxAsof)})` : "(no disponibles)"}</>} actions={actions} />
      {res.warnings.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {res.warnings.map((w) => (
            <Callout key={w} tone="warn">
              {w}
            </Callout>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4 xl:grid-cols-8">
            <div className="col-span-2 flex flex-col gap-1">
              <span className="t-label">Valor actual</span>
              <span className="t-kpi">{money(t.value)}</span>
              <span className="t-meta num">
                <Delta v={t.netContributions > 0 ? t.gain / t.netContributions : null} /> · {money(t.gain)} sobre lo aportado
              </span>
            </div>
            <Stat label="Aportado neto" value={money(t.netContributions, "EUR", 0)} sub={t.inferredDeposits > 0 ? `${money(t.inferredDeposits, "EUR", 0)} inferido` : undefined} />
            <Stat label="TWR" value={<Delta v={res.twr.cumulative} />} sub={res.twr.annualized !== null ? `${pct(res.twr.annualized)} anual` : `${res.twr.days} días`} />
            <Stat label="TIR (MWR)" value={<Delta v={res.mwr.xirr} />} sub={res.mwr.note ? "ver nota" : "anualizada"} />
            <Stat label="P&L no realizado" value={<span className={t.unrealized >= 0 ? "text-pos" : "text-neg"}>{money(t.unrealized, "EUR", 0)}</span>} />
            <Stat label="P&L realizado" value={money(t.realized, "EUR", 0)} />
            <Stat label="Dividendos + intereses" value={money(t.dividends + t.interest, "EUR", 0)} sub={`Comisiones ${money(t.fees, "EUR", 2)}`} />
          </div>
          {res.mwr.note && <p className="t-meta mt-4">{res.mwr.note}</p>}
        </Panel>

        <Panel title="Evolución" meta="Valor de mercado (naranja) frente al capital aportado neto (discontinua)" className="lg:col-span-2">
          <ValueChart series={res.series} />
        </Panel>

        <Panel title="Distribución frente a objetivos">
          <AllocationBars rows={dev} settings={pf.settings} />
        </Panel>
        <Panel title="Reparto de tu próxima aportación">
          <ContributionPlanner values={values} other={other} settings={pf.settings} />
        </Panel>

        <Panel title="Posiciones" pad={false} className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="border-y border-line text-right text-[11px] uppercase tracking-[0.05em] text-ink-3">
                  <th className="px-4 py-2 text-left font-medium md:px-5">Instrumento</th>
                  <th className="px-3 py-2 text-left font-medium">Bloque</th>
                  <th className="px-3 py-2 font-medium">Unidades</th>
                  <th className="px-3 py-2 font-medium">Coste medio</th>
                  <th className="px-3 py-2 font-medium">Precio</th>
                  <th className="px-3 py-2 font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">Peso</th>
                  <th className="px-3 py-2 font-medium">P&L</th>
                  <th className="px-4 py-2 text-left font-medium md:px-5">Momentum</th>
                </tr>
              </thead>
              <tbody>
                {held.map((p) => {
                  const mr = p.instrument.market_ticker ? rowsBy.get(p.instrument.market_ticker) : undefined;
                  return (
                    <tr key={p.instrument.id} className="border-b border-line">
                      <td className="px-4 py-2.5 md:px-5">
                        <div className="text-ink">{p.instrument.name}</div>
                        <div className="t-meta font-mono">{p.instrument.isin ?? p.instrument.market_ticker ?? ""}</div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">{BUCKET_LABELS[p.instrument.bucket]}</td>
                      <td className="num px-3 py-2.5 text-right">{num(p.qty, p.qty % 1 ? 4 : 0)}</td>
                      <td className="num px-3 py-2.5 text-right text-ink-2">{money(p.avgCostEur)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="num">{p.price !== null ? `${num(p.price)} ${p.priceCurrency ?? ""}` : "—"}</div>
                        <div className="t-meta" title={p.priceSource ?? undefined}>
                          {p.priceDate ? dateLabel(p.priceDate, false) : "sin precio"}
                          {p.priceSource?.startsWith("último") && " · operación"}
                        </div>
                      </td>
                      <td className="num px-3 py-2.5 text-right text-ink">{money(p.valueEur)}</td>
                      <td className="num px-3 py-2.5 text-right text-ink-2">{pct(p.weight, 1, false)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className={`num ${(p.unrealizedEur ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>{money(p.unrealizedEur)}</div>
                        <Delta v={p.unrealizedPct} className="text-[12px]" />
                      </td>
                      <td className="px-4 py-2.5 md:px-5">
                        {mr ? (
                          <Link href={`/research/${mr.t}`} className="inline-flex items-center gap-2">
                            <StatePill state={mr.st} short />
                            <span className="num text-[12px] text-ink-3">#{mr.rank}</span>
                          </Link>
                        ) : (
                          <span className="t-meta">{p.instrument.market_ticker ? "fuera del universo" : "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 px-4 py-3 md:px-5">
            <span className="t-meta">Efectivo: <span className="num text-ink-2">{money(res.cashEur)}</span></span>
            {res.byCurrency.map((c) => (
              <span key={c.currency} className="t-meta">
                Exposición {c.currency}: <span className="num text-ink-2">{pct(c.weight, 1, false)}</span>
              </span>
            ))}
          </div>
        </Panel>

        {momentumHoldings.length > 0 && (
          <Panel title="Momentum de tus posiciones" meta="Estado en el radar de cada posición del universo analizado" className="lg:col-span-2">
            <div className="flex flex-col gap-2">
              {momentumHoldings.map((p) => {
                const r = rowsBy.get(p.instrument.market_ticker!)!;
                const alert = r.st === "weakening" || (r.dm !== null && r.dm <= -15) || r.m < 50;
                return (
                  <div key={p.instrument.id} className="flex flex-wrap items-center gap-3 text-[13px]">
                    <Link href={`/research/${r.t}`} className="font-mono text-ink hover:text-accent">
                      {r.t}
                    </Link>
                    <StatePill state={r.st} short />
                    <span className="num text-ink-3">Momentum {Math.round(r.m)} · ΔMom {r.dm !== null ? Math.round(r.dm) : "—"}</span>
                    {alert && <Badge tone="warn">Pérdida de tendencia</Badge>}
                    {r.pst && r.pst !== r.st && <span className="t-meta">antes: {r.pst}</span>}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
