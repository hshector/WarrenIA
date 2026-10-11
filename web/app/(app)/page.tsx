import Link from "next/link";

import { ActionPill, AssetAvatar, DeltaPill } from "@/components/fin/fin";
import { PlanSplit } from "@/components/plan/choosers";
import { Card } from "@/components/ui/primitives";
import { money, moneyHeadline, pct } from "@/lib/format";
import { hasActions } from "@/lib/market/radar";
import { getMarket, getRadar, loadMarket } from "@/lib/market/source";
import { STATE_SIMPLE } from "@/lib/market/types";
import { momentumRoute, normaliseChoices, STOCK_POSITIONS } from "@/lib/plan/catalog";
import { targetDeviation } from "@/lib/portfolio/engine";
import { loadPortfolio } from "@/lib/portfolio/load";
import { BUCKET_LABELS } from "@/lib/portfolio/types";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Home" };

const BUCKET_DOT = { core: "bg-accent", gold: "bg-gold", momentum: "bg-violet" } as const;

export default async function Home() {
  const { latest, meta } = await loadMarket();
  const store = await requireStore();
  const [radar, market, pf, watch] = await Promise.all([getRadar(latest), getMarket(latest), loadPortfolio(store, latest, meta), store.watchlist()]);
  const res = pf.result;
  const rows = radar?.rows ?? [];
  const withActions = hasActions(rows);
  const top = rows
    .filter((r) => r.cls === "stock" && (!withActions || r.act === "candidate"))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);
  const byT = new Map((radar?.rows ?? []).map((r) => [r.t, r]));
  const dev = res ? targetDeviation(res, pf.settings) : null;
  const values = dev ? (Object.fromEntries(dev.map((d) => [d.bucket, d.value])) as Record<"core" | "gold" | "momentum", number>) : { core: 0, gold: 0, momentum: 0 };

  // Only facts that matter to the user: their positions and the assets they follow.
  const news: { t: string; text: string }[] = [];
  for (const p of res?.positions ?? []) {
    const r = p.instrument.market_ticker ? byT.get(p.instrument.market_ticker) : undefined;
    if (!r || p.qty <= 0) continue;
    if (withActions && !r.hold) news.push({ t: r.t, text: `${r.n}: consider selling (it lost its momentum)` });
    else if (r.st === "weakening") news.push({ t: r.t, text: `${r.n} is losing steam` });
  }
  for (const w of watch) {
    const r = byT.get(w.ticker);
    if (r?.pst && r.pst !== r.st) news.push({ t: r.t, text: `${r.n}: now “${STATE_SIMPLE[r.st]}”` });
  }
  const spy = market?.benchmarks[market.primary];
  const gainPct = res && res.totals.netContributions > 0 ? res.totals.gain / res.totals.netContributions : null;

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4">
      <section className="nebula relative overflow-hidden rounded-[28px] px-6 pb-6 pt-7 shadow-[0_8px_24px_var(--hero-shadow)]">
        <p className="text-[15px] font-medium text-hero-ink/75">Your portfolio</p>
        {res ? (
          <>
            <p className="num mt-1 whitespace-nowrap text-[clamp(32px,10vw,44px)] font-bold leading-tight tracking-[-0.03em]">{moneyHeadline(res.totals.value)}</p>
            <p className="num mt-1 text-[15px] font-medium text-hero-ink/85">
              {res.totals.gain >= 0 ? "+" : ""}
              {money(res.totals.gain)} ({pct(gainPct)}) since you started
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/portfolio" className="tap whitespace-nowrap rounded-full bg-hero-btn px-5 py-2.5 text-[15px] font-semibold text-hero-btn-ink">
                View portfolio
              </Link>
              <Link href="/portfolio?add=1" className="tap whitespace-nowrap rounded-full bg-hero-ink/10 px-5 py-2.5 text-[15px] font-semibold text-hero-ink">
                Add transaction
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-[30px] font-bold leading-tight tracking-[-0.02em]">Start tracking your investments</p>
            <p className="mt-2 max-w-md text-[15px] text-hero-ink/85">Record your deposits and purchases to see what you earn and whether your mix follows the plan.</p>
            <Link href="/portfolio" className="tap mt-6 inline-block rounded-full bg-hero-btn px-5 py-2.5 text-[15px] font-semibold text-hero-btn-ink">
              Set up portfolio
            </Link>
          </>
        )}
      </section>

      <Card
        title="Your next contribution"
        action={
          <Link href="/plan" className="text-accent">
            Change products
          </Link>
        }
      >
        <PlanSplit
          values={values}
          other={res?.allocation.find((a) => a.bucket === "other")?.value ?? 0}
          settings={pf.settings}
          choices={normaliseChoices(pf.settings.choices)}
          momentumLabel={momentumRoute(values.momentum) === "etf" ? undefined : `Buy candidates from the radar (up to ${STOCK_POSITIONS})`}
        />
      </Card>

      {dev && (
        <Card title="Your mix">
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
              </li>
            ))}
          </ul>
        </Card>
      )}

      {news.length > 0 && (
        <Card title="News">
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

      <Card
        title={withActions ? "Buy candidates" : "Strongest today"}
        sub={withActions ? "Strong trend, steady, not overheated and with solid finances" : undefined}
        action={
          <Link href="/radar" className="text-accent">
            Open radar
          </Link>
        }
        pad={false}
      >
        <ul className="mt-2 divide-y divide-line">
          {top.map((r) => (
            <li key={r.t}>
              <Link href={`/research/${r.t}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2 active:bg-surface-3">
                <AssetAvatar t={r.t} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-semibold">{r.n}</span>
                  <span className="block truncate text-[13px] text-ink-2">
                    {r.t} · {withActions ? `momentum ${Math.round(r.ov)}${r.fund !== null && r.fund !== undefined ? ` · fundamentals ${Math.round(r.fund)}` : ""}` : STATE_SIMPLE[r.st]}
                  </span>
                </span>
                {withActions ? <ActionPill action={r.act} className="hidden sm:inline-flex" /> : null}
                <DeltaPill v={r.r6m} />
              </Link>
            </li>
          ))}
          {!top.length && <li className="px-5 py-6 text-[15px] text-ink-2">{rows.length ? "No buy candidates today: no leader passes every check." : "No ranking published yet."}</li>}
        </ul>
      </Card>

      {spy && market && (
        <Card title="The market">
          <p className="text-[15px] leading-relaxed">
            The S&amp;P 500 ({market.primary}) is{" "}
            <span className={spy.px_vs_sma200 !== null && spy.px_vs_sma200 >= 0 ? "font-semibold text-pos" : "font-semibold text-neg"}>
              {pct(spy.px_vs_sma200 !== null ? Math.abs(spy.px_vs_sma200) : null, 1, false)} {spy.px_vs_sma200 !== null && spy.px_vs_sma200 >= 0 ? "above" : "below"}
            </span>{" "}
            its 200-day average, and <span className="font-semibold">{pct(market.breadth.above_sma200, 0, false)}</span> of the stocks analysed are in an uptrend.
          </p>
        </Card>
      )}
    </div>
  );
}
