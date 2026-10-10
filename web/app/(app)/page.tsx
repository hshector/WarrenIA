import Link from "next/link";

import { Delta, ScoreBar, StatePill, Ticker } from "@/components/fin/fin";
import { AllocationBars } from "@/components/portfolio/allocation";
import { IconArrowUpRight } from "@/components/ui/icons";
import { Badge, ButtonLink, EmptyState, Panel, Stat } from "@/components/ui/primitives";
import { dateLabel, int, money, num, pct, score } from "@/lib/format";
import { getMarket, getRadar, loadMarket } from "@/lib/market/source";
import { STATE_LABELS, STATE_SHORT, type StateKey } from "@/lib/market/types";
import { targetDeviation } from "@/lib/portfolio/engine";
import { loadPortfolio } from "@/lib/portfolio/load";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Overview" };

const STATE_ORDER: StateKey[] = ["strong", "improving", "breakout", "extended", "weakening", "speculative", "neutral"];
const STATE_BAR: Record<StateKey, string> = {
  strong: "bg-pos",
  improving: "bg-accent",
  breakout: "bg-info",
  extended: "bg-warn",
  weakening: "bg-neg",
  speculative: "bg-[#c08cf0]",
  neutral: "bg-ink-3/50",
};

export default async function Overview() {
  const { latest, meta } = await loadMarket();
  const store = await requireStore();
  const [radar, market, pf, watch] = await Promise.all([getRadar(latest), getMarket(latest), loadPortfolio(store, latest, meta), store.watchlist()]);
  const stocks = (radar?.rows ?? []).filter((r) => r.cls === "stock").sort((a, b) => a.rank - b.rank);
  const top = stocks.slice(0, 8);
  const byT = new Map((radar?.rows ?? []).map((r) => [r.t, r]));
  const res = pf.result;

  // Alerts: only facts derived from published data.
  const alerts: { t: string; text: string; tone: "warn" | "pos" | "info" }[] = [];
  for (const p of res?.positions ?? []) {
    const r = p.instrument.market_ticker ? byT.get(p.instrument.market_ticker) : undefined;
    if (r && p.qty > 0 && (r.st === "weakening" || (r.dm !== null && r.dm <= -15))) alerts.push({ t: r.t, text: `En cartera: ${STATE_SHORT[r.st]}, ΔMomentum ${r.dm !== null ? Math.round(r.dm) : "—"} en 21 sesiones`, tone: "warn" });
  }
  for (const w of watch) {
    const r = byT.get(w.ticker);
    if (r?.pst && r.pst !== r.st) alerts.push({ t: r.t, text: `Watchlist: ${STATE_SHORT[r.pst]} → ${STATE_SHORT[r.st]}`, tone: r.st === "weakening" ? "warn" : "info" });
  }
  for (const r of stocks.slice(0, 50)) {
    if (r.pst && r.pst !== r.st && (r.st === "strong" || r.st === "breakout")) alerts.push({ t: r.t, text: `Top 50: nuevo estado ${STATE_LABELS[r.st]}`, tone: "pos" });
  }
  const spy = market?.benchmarks[market.primary];
  const statesTotal = market ? Object.values(market.states.stock).reduce((s, n) => s + (n ?? 0), 0) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 pb-1 pt-1">
        <h1 className="t-title">Overview</h1>
        <p className="t-body">{latest ? <>Mercado al cierre del {dateLabel(latest.data_asof)} · cartera valorada con los últimos precios disponibles.</> : "Sin datos de mercado publicados todavía."}</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel title="Tu cartera" actions={<Link href="/portfolio" className="inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink">Portfolio <IconArrowUpRight size={14} /></Link>}>
          {res ? (
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-4">
                <div>
                  <span className="t-label">Valor actual</span>
                  <div className="t-kpi mt-1">{money(res.totals.value)}</div>
                  <div className="t-meta num mt-1">
                    {money(res.totals.gain)} ({pct(res.totals.netContributions > 0 ? res.totals.gain / res.totals.netContributions : null)}) sobre {money(res.totals.netContributions, "EUR", 0)} aportados
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="TWR" value={<Delta v={res.twr.cumulative} />} sub={res.twr.annualized !== null ? `${pct(res.twr.annualized)} anual` : "acumulada"} />
                  <Stat label="TIR" value={<Delta v={res.mwr.xirr} />} sub="anualizada" />
                </div>
              </div>
              <AllocationBars rows={targetDeviation(res, pf.settings)} settings={pf.settings} />
            </div>
          ) : (
            <EmptyState title="Aún no hay operaciones" action={<ButtonLink href="/portfolio" variant="primary">Configurar cartera</ButtonLink>}>
              Registra tus instrumentos y aportaciones para seguir valor, rentabilidad (TWR y TIR) y desviación frente a tu reparto 75 / 10 / 15.
            </EmptyState>
          )}
        </Panel>

        <Panel title="Régimen de mercado" meta={market ? `${market.primary} y amplitud del universo de acciones` : undefined}>
          {market && spy ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-4">
                <Stat label={market.primary} value={num(spy.price)} sub={<Delta v={spy.d1 ?? null} />} />
                <Stat label="vs SMA200" value={<Delta v={spy.px_vs_sma200} />} sub={spy.px_vs_sma200 !== null && spy.px_vs_sma200 > 0 ? "tendencia alcista" : "por debajo"} />
                <Stat label="3 meses" value={<Delta v={spy.r3m} />} sub={`vol 63d ${pct(spy.vol_63, 0, false)}`} />
              </div>
              <div className="grid grid-cols-3 gap-4 border-t border-line pt-4">
                <Stat label="> SMA200" value={pct(market.breadth.above_sma200, 0, false)} sub="de las acciones" />
                <Stat label="> SMA50" value={pct(market.breadth.above_sma50, 0, false)} sub="de las acciones" />
                <Stat label="Máx. 52 sem." value={pct(market.breadth.new_52w_high, 1, false)} sub="en máximos" />
              </div>
              {statesTotal > 0 && (
                <div className="border-t border-line pt-4">
                  <div className="flex h-2 overflow-hidden rounded-full">
                    {STATE_ORDER.map((s) => {
                      const n = market.states.stock[s] ?? 0;
                      return n ? <span key={s} className={STATE_BAR[s]} style={{ width: `${(100 * n) / statesTotal}%` }} title={`${STATE_LABELS[s]}: ${n}`} /> : null;
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {STATE_ORDER.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-3">
                        <span className={`h-1.5 w-1.5 rounded-full ${STATE_BAR[s]}`} />
                        {STATE_SHORT[s]} <span className="num text-ink-2">{int(market.states.stock[s] ?? 0)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="t-body">Sin datos de mercado.</p>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel title="Momentum Radar · top acciones" meta="Ordenadas por Overall Momentum Rank" actions={<Link href="/radar" className="inline-flex items-center gap-1 text-[12.5px] text-ink-3 hover:text-ink">Radar completo <IconArrowUpRight size={14} /></Link>} pad={false}>
          {top.length ? (
            <ul className="divide-y divide-line">
              {top.map((r) => (
                <li key={r.t}>
                  <Link href={`/research/${r.t}`} className="grid grid-cols-[28px_64px_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2 md:px-5">
                    <span className="num text-right text-[12px] text-ink-3">{r.rank}</span>
                    <Ticker t={r.t} />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] text-ink-2">{r.n}</span>
                      <span className="block truncate text-[11.5px] text-ink-3">{r.why.slice(0, 2).join(" · ")}</span>
                    </span>
                    <StatePill state={r.st} short className="hidden sm:inline-flex" />
                    <span className="flex w-16 flex-col items-end gap-1">
                      <span className="num text-[13px]">{score(r.ov)}</span>
                      <ScoreBar v={r.ov} width="w-14" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-body px-5 pb-5">Sin ranking publicado.</p>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Actividad relevante" meta="Cambios desde la ejecución anterior y alertas de tus posiciones">
            {alerts.length ? (
              <ul className="flex flex-col gap-2">
                {alerts.slice(0, 8).map((a, i) => (
                  <li key={a.t + i} className="flex items-center gap-2.5 text-[13px]">
                    <Badge tone={a.tone}>{a.tone === "warn" ? "Alerta" : a.tone === "pos" ? "Nuevo" : "Cambio"}</Badge>
                    <Link href={`/research/${a.t}`} className="font-mono text-ink hover:text-accent">
                      {a.t}
                    </Link>
                    <span className="truncate text-ink-2">{a.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-body">Sin cambios relevantes en tus posiciones, tu watchlist ni el top 50.</p>
            )}
          </Panel>
          <Panel title="Fortaleza sectorial" meta="ETFs sectoriales SPDR · momentum 12-1 ajustado y 3 meses" pad={false}>
            <ul className="divide-y divide-line">
              {(market?.sectors ?? []).slice(0, 11).map((s) => (
                <li key={s.sector} className="grid grid-cols-[minmax(0,1fr)_56px_64px_70px] items-center gap-3 px-4 py-2 text-[12.5px] md:px-5">
                  <span className="truncate text-ink-2">
                    {s.sector} <span className="font-mono text-[11px] text-ink-3">{s.etf}</span>
                  </span>
                  <Delta v={s.r3m} className="text-right" />
                  <ScoreBar v={s.strength} width="w-14" />
                  <span className="num text-right text-ink-3" title="Acciones del sector en el top 50">
                    {s.in_top50} top50
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
      <p className="t-meta">WarrenIA es una herramienta de análisis: no ejecuta operaciones ni da recomendaciones de compra o venta. Datos de cierre diario.</p>
    </div>
  );
}
