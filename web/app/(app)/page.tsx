import Link from "next/link";

import { AssetAvatar, DeltaPill } from "@/components/fin/fin";
import { ContributionPlanner } from "@/components/portfolio/forms";
import { Card } from "@/components/ui/primitives";
import { money, pct } from "@/lib/format";
import { getMarket, getRadar, loadMarket } from "@/lib/market/source";
import { STATE_SIMPLE } from "@/lib/market/types";
import { targetDeviation } from "@/lib/portfolio/engine";
import { loadPortfolio } from "@/lib/portfolio/load";
import { BUCKET_LABELS } from "@/lib/portfolio/types";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Inicio" };

const BUCKET_DOT = { core: "bg-accent", gold: "bg-[#e3a008]", momentum: "bg-[#7048e8]" } as const;

export default async function Home() {
  const { latest, meta } = await loadMarket();
  const store = await requireStore();
  const [radar, market, pf, watch] = await Promise.all([getRadar(latest), getMarket(latest), loadPortfolio(store, latest, meta), store.watchlist()]);
  const res = pf.result;
  const top = (radar?.rows ?? []).filter((r) => r.cls === "stock").sort((a, b) => a.rank - b.rank).slice(0, 5);
  const byT = new Map((radar?.rows ?? []).map((r) => [r.t, r]));
  const dev = res ? targetDeviation(res, pf.settings) : null;
  const values = dev ? (Object.fromEntries(dev.map((d) => [d.bucket, d.value])) as Record<"core" | "gold" | "momentum", number>) : { core: 0, gold: 0, momentum: 0 };

  // Only facts that matter to the user: their positions and the assets they follow.
  const news: { t: string; text: string }[] = [];
  for (const p of res?.positions ?? []) {
    const r = p.instrument.market_ticker ? byT.get(p.instrument.market_ticker) : undefined;
    if (r && p.qty > 0 && r.st === "weakening") news.push({ t: r.t, text: `${r.n} está perdiendo fuerza` });
  }
  for (const w of watch) {
    const r = byT.get(w.ticker);
    if (r?.pst && r.pst !== r.st) news.push({ t: r.t, text: `${r.n}: ahora «${STATE_SIMPLE[r.st]}»` });
  }
  const spy = market?.benchmarks[market.primary];
  const gainPct = res && res.totals.netContributions > 0 ? res.totals.gain / res.totals.netContributions : null;

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4">
      <section className="nebula relative overflow-hidden rounded-[28px] px-6 pb-6 pt-7 shadow-[0_8px_24px_rgb(242_97_29/0.18)]">
        <p className="text-[15px] font-medium text-white/85">Tu cartera</p>
        {res ? (
          <>
            <p className="num mt-1 text-[44px] font-bold leading-tight tracking-[-0.03em]">{money(res.totals.value)}</p>
            <p className="num mt-1 text-[15px] font-medium text-white/90">
              {res.totals.gain >= 0 ? "+" : ""}
              {money(res.totals.gain)} ({pct(gainPct)}) desde que empezaste
            </p>
            <div className="mt-6 flex gap-2">
              <Link href="/portfolio" className="rounded-full bg-white/95 px-5 py-2.5 text-[15px] font-semibold text-accent-2">
                Ver cartera
              </Link>
              <Link href="/portfolio?add=1" className="rounded-full bg-white/20 px-5 py-2.5 text-[15px] font-semibold text-white backdrop-blur">
                Añadir operación
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-[30px] font-bold leading-tight tracking-[-0.02em]">Empieza a registrar tus inversiones</p>
            <p className="mt-2 max-w-md text-[15px] text-white/90">Apunta tus aportaciones y compras para ver cuánto ganas y si tu reparto sigue el plan.</p>
            <Link href="/portfolio" className="mt-6 inline-block rounded-full bg-white/95 px-5 py-2.5 text-[15px] font-semibold text-accent-2">
              Configurar cartera
            </Link>
          </>
        )}
      </section>

      <Card title="Tu próxima aportación" action={<Link href="/settings?tab=portfolio" className="text-accent">Ajustar plan</Link>}>
        <ContributionPlanner values={values} other={res?.allocation.find((a) => a.bucket === "other")?.value ?? 0} settings={pf.settings} />
      </Card>

      {dev && (
        <Card title="Tu reparto">
          <ul className="flex flex-col gap-4">
            {dev.map((d) => (
              <li key={d.bucket}>
                <div className="mb-1.5 flex items-center justify-between text-[15px]">
                  <span className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${BUCKET_DOT[d.bucket]}`} />
                    {BUCKET_LABELS[d.bucket]}
                  </span>
                  <span className="num">
                    <span className="font-semibold">{pct(d.weight, 0, false)}</span>
                    <span className="text-ink-3"> / {pct(d.target, 0, false)}</span>
                  </span>
                </div>
                <div className="relative h-1.5 rounded-full bg-surface-3">
                  <div className={`absolute inset-y-0 left-0 rounded-full ${BUCKET_DOT[d.bucket]}`} style={{ width: `${Math.min(100, d.weight * 100)}%` }} />
                  <div className="absolute -inset-y-1 w-0.5 rounded bg-ink/70" style={{ left: `${d.target * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {news.length > 0 && (
        <Card title="Novedades">
          <ul className="flex flex-col gap-3">
            {news.slice(0, 4).map((n, i) => (
              <li key={n.t + i}>
                <Link href={`/research/${n.t}`} className="flex items-center gap-3 text-[15px]">
                  <AssetAvatar t={n.t} size={34} />
                  {n.text}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Lo más fuerte hoy" action={<Link href="/radar" className="text-accent">Ver radar</Link>} pad={false}>
        <ul className="mt-2 divide-y divide-line">
          {top.map((r) => (
            <li key={r.t}>
              <Link href={`/research/${r.t}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
                <AssetAvatar t={r.t} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-semibold">{r.n}</span>
                  <span className="block truncate text-[13px] text-ink-2">
                    {r.t} · {STATE_SIMPLE[r.st]}
                  </span>
                </span>
                <DeltaPill v={r.r6m} />
              </Link>
            </li>
          ))}
          {!top.length && <li className="px-5 py-6 text-[15px] text-ink-2">Aún no hay ranking publicado.</li>}
        </ul>
      </Card>

      {spy && market && (
        <Card title="El mercado">
          <p className="text-[15px] leading-relaxed">
            El S&amp;P 500 ({market.primary}) está{" "}
            <span className={spy.px_vs_sma200 !== null && spy.px_vs_sma200 >= 0 ? "font-semibold text-pos" : "font-semibold text-neg"}>
              {pct(spy.px_vs_sma200 !== null ? Math.abs(spy.px_vs_sma200) : null, 1, false)} {spy.px_vs_sma200 !== null && spy.px_vs_sma200 >= 0 ? "por encima" : "por debajo"}
            </span>{" "}
            de su media de 200 días, y el <span className="font-semibold">{pct(market.breadth.above_sma200, 0, false)}</span> de las acciones analizadas está en tendencia alcista.
          </p>
        </Card>
      )}
    </div>
  );
}
