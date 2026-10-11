import Link from "next/link";

import { AssetAvatar, Delta } from "@/components/fin/fin";
import { InstrumentForm, TransactionForm } from "@/components/portfolio/forms";
import { ValueChart } from "@/components/portfolio/value-chart";
import { PageHeader } from "@/components/shell/page-header";
import { IconChevronDown } from "@/components/ui/icons";
import { ButtonLink, Callout, Card, EmptyState } from "@/components/ui/primitives";
import { dateLabel, money, moneyHeadline, pct, units } from "@/lib/format";
import { getRadar, loadMarket } from "@/lib/market/source";
import { STATE_SIMPLE } from "@/lib/market/types";
import { targetDeviation } from "@/lib/portfolio/engine";
import { loadPortfolio } from "@/lib/portfolio/load";
import { BUCKET_LABELS } from "@/lib/portfolio/types";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Cartera" };

const BUCKET_DOT = { core: "bg-accent", gold: "bg-gold", momentum: "bg-violet" } as const;

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const sp = await searchParams;
  const { latest, meta } = await loadMarket();
  const store = await requireStore();
  const [pf, radar] = await Promise.all([loadPortfolio(store, latest, meta), getRadar(latest)]);
  const res = pf.result;
  const rowsBy = new Map((radar?.rows ?? []).map((r) => [r.t, r]));
  const actions = (
    <>
      <TransactionForm instruments={pf.instruments} defaultOpen={sp.add === "1" && pf.instruments.length > 0} />
      <InstrumentForm />
    </>
  );

  // Same outer structure in every branch so the action sheets keep their state across revalidation.
  const shell = (body: React.ReactNode) => (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4">
      <PageHeader title="Cartera" actions={actions} />
      {body}
    </div>
  );
  if (pf.error) {
    return shell(
      <>
        <Callout tone="neg" title="Hay operaciones incoherentes">
          {pf.error} Revísalas en <Link href="/portfolio/transactions" className="underline">Operaciones</Link>.
        </Callout>
      </>,
    );
  }
  if (!res) {
    return shell(
      <>
        <EmptyState
          title="Tu cartera está vacía"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/portfolio/import">Importar CSV</ButtonLink>
            </div>
          }
        >
          <p>1. Añade un instrumento (por ejemplo, tu ETF MSCI World).</p>
          <p>2. Registra tu aportación y tu compra.</p>
          <p className="mt-2 text-ink-3">Usa los botones de arriba.</p>
        </EmptyState>
      </>,
    );
  }
  const t = res.totals;
  const dev = targetDeviation(res, pf.settings);
  const held = res.positions.filter((p) => p.qty > 1e-9);
  const gainPct = t.netContributions > 0 ? t.gain / t.netContributions : null;

  return shell(
    <>
      <Card>
        <p className="text-[14px] text-ink-2">Valor total</p>
        <p className="num mt-0.5 whitespace-nowrap text-[clamp(30px,9.5vw,40px)] font-bold leading-tight tracking-[-0.03em]">{moneyHeadline(t.value)}</p>
        <p className="num text-[15px]">
          <span className={t.gain >= 0 ? "font-semibold text-pos" : "font-semibold text-neg"}>
            {t.gain >= 0 ? "+" : ""}
            {money(t.gain)} ({pct(gainPct)})
          </span>{" "}
          <span className="text-ink-3">sobre {money(t.netContributions, "EUR", 0)} aportados</span>
        </p>
        <div className="mt-4">
          <ValueChart series={res.series} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
          <div>
            <p className="text-[13px] text-ink-2">Rentabilidad de tus inversiones</p>
            <Delta v={res.twr.annualized ?? res.twr.cumulative} className="text-[19px] font-bold" />
            <p className="text-[12.5px] text-ink-3">{res.twr.annualized !== null ? "anual (TWR)" : "acumulada (TWR)"}</p>
          </div>
          <div>
            <p className="text-[13px] text-ink-2">Rentabilidad de tu dinero</p>
            <Delta v={res.mwr.xirr} className="text-[19px] font-bold" />
            <p className="text-[12.5px] text-ink-3">anual (TIR)</p>
          </div>
        </div>
      </Card>

      {res.warnings.map((w) => (
        <Callout key={w} tone="warn">
          {w}
        </Callout>
      ))}

      <Card title="Posiciones" pad={false}>
        <ul className="mt-2 divide-y divide-line">
          {held.map((p) => {
            const mr = p.instrument.market_ticker ? rowsBy.get(p.instrument.market_ticker) : undefined;
            const label = p.instrument.market_ticker ?? p.instrument.isin?.slice(0, 4) ?? p.instrument.name.slice(0, 3).toUpperCase();
            const inner = (
              <>
                <AssetAvatar t={label} logo={!!p.instrument.market_ticker} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[15.5px] font-semibold leading-snug">{p.instrument.name}</span>
                  <span className="flex min-w-0 text-[13px] text-ink-2">
                    <span className="num shrink-0 whitespace-nowrap">{units(p.qty)} uds</span>
                    <span className="truncate">
                      &nbsp;· {BUCKET_LABELS[p.instrument.bucket]}
                      {mr && <span className={mr.st === "weakening" ? "text-neg" : ""}> · {STATE_SIMPLE[mr.st]}</span>}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block whitespace-nowrap text-[15.5px] font-semibold">{moneyHeadline(p.valueEur)}</span>
                  <Delta v={p.unrealizedPct} className="text-[13px] font-medium" />
                </span>
              </>
            );
            return (
              <li key={p.instrument.id}>
                {mr ? (
                  <Link href={`/research/${mr.t}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2 active:bg-surface-3">
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-3">{inner}</div>
                )}
              </li>
            );
          })}
          {res.cashEur > 0.005 && (
            <li className="flex items-center justify-between px-5 py-3 text-[15px]">
              <span className="text-ink-2">Efectivo</span>
              <span className="num font-semibold">{money(res.cashEur)}</span>
            </li>
          )}
        </ul>
      </Card>

      <Card title="Reparto frente a tu objetivo">
        <ul className="flex flex-col gap-4">
          {dev.map((d) => (
            <li key={d.bucket}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[15px]">
                <span className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${BUCKET_DOT[d.bucket]}`} />
                  {BUCKET_LABELS[d.bucket]}
                </span>
                <span className="num shrink-0 whitespace-nowrap">
                  <span className="font-semibold">{pct(d.weight, 0, false)}</span>
                  <span className="text-ink-3"> / {pct(d.target, 0, false)}</span>
                </span>
              </div>
              <div className="relative h-1.5 rounded-full bg-surface-3">
                <div className={`absolute inset-y-0 left-0 rounded-full ${BUCKET_DOT[d.bucket]}`} style={{ width: `${Math.min(100, d.weight * 100)}%` }} />
                <div className="absolute -inset-y-1 w-0.5 rounded bg-ink/70" style={{ left: `${d.target * 100}%` }} />
              </div>
              {d.outsideBand && <p className="mt-1 text-[13px] text-warn">{d.deviation > 0 ? "Por encima" : "Por debajo"} de lo previsto: la próxima aportación lo corrige (ver Inicio).</p>}
            </li>
          ))}
        </ul>
      </Card>

      <section className="card overflow-hidden">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
            Más datos
            <IconChevronDown size={18} className="text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <dl className="divide-y divide-line px-5 pb-3 text-[15px]">
            {[
              ["Ganancia no realizada", money(t.unrealized)],
              ["Ganancia realizada (FIFO)", money(t.realized)],
              ["Dividendos", money(t.dividends)],
              ["Intereses", money(t.interest)],
              ["Comisiones", money(t.fees)],
              ["Impuestos", money(t.taxes)],
              ...res.byCurrency.map((c) => [`Exposición en ${c.currency}`, pct(c.weight, 1, false)] as [string, string]),
              ["Valorado a", dateLabel(res.asOf)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2.5">
                <dt className="text-ink-2">{k}</dt>
                <dd className="num font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {res.mwr.note && <p className="px-5 pb-4 text-[13px] text-ink-3">{res.mwr.note}</p>}
        </details>
      </section>

      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/portfolio/transactions" size="sm">
          Operaciones e instrumentos
        </ButtonLink>
        <ButtonLink href="/portfolio/import" size="sm">
          Importar CSV
        </ButtonLink>
      </div>
    </>,
  );
}
