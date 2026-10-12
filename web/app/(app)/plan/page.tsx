import Link from "next/link";

import { ActionPill, AssetAvatar, DeltaPill } from "@/components/fin/fin";
import { CashPicker, CoreChooser, DiversifierPicker, PlanSplit } from "@/components/plan/choosers";
import { ProductCard } from "@/components/plan/product";
import { WealthProjection } from "@/components/plan/projection";
import { PageHeader } from "@/components/shell/page-header";
import { Callout, Card } from "@/components/ui/primitives";
import { dateLabel, money, pct } from "@/lib/format";
import { hasActions } from "@/lib/market/radar";
import { getMarket, getRadar, loadMarket } from "@/lib/market/source";
import { BUCKET_NAME, byIsin, MIN_SLEEVE_FOR_STOCKS_EUR, momentumRoute, normaliseChoices, recommended, STOCK_POSITIONS, VERIFIED_ON } from "@/lib/plan/catalog";
import { activeKeys, blockValues, targetDeviation } from "@/lib/portfolio/engine";
import { loadPortfolio } from "@/lib/portfolio/load";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Plan" };

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function PlanPage() {
  const { latest, meta } = await loadMarket();
  const store = await requireStore();
  const [radar, market, pf] = await Promise.all([getRadar(latest), getMarket(latest), loadPortfolio(store, latest, meta)]);
  const res = pf.result;
  const dev = res ? targetDeviation(res, pf.settings) : null;
  const values = blockValues(dev);
  const choices = normaliseChoices(pf.settings.choices);
  const stats = market?.proxies ?? {};
  const momEtf = recommended("momentum");
  const route = momentumRoute(values.momentum);
  const rows = radar?.rows ?? [];
  const candidates = hasActions(rows) ? rows.filter((r) => r.cls === "stock" && r.act === "candidate").sort((a, b) => a.rank - b.rank).slice(0, STOCK_POSITIONS) : [];
  const t = pf.settings.targets;
  const core = byIsin(choices.core[0].isin)!;

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4">
      <PageHeader title="Your plan" sub="What to buy each month, with which product and why. Built for a Spanish tax resident." />

      <Card
        title="This month"
        sub={activeKeys(t)
          .map((k) => `${BUCKET_NAME[k]} ${pct(t[k], 0, false)}`)
          .join(" · ")}
      >
        <PlanSplit
          values={values}
          other={res?.allocation.find((a) => a.bucket === "other")?.value ?? 0}
          settings={pf.settings}
          choices={choices}
          momentumLabel={route === "etf" ? undefined : `Buy candidates from the radar (up to ${STOCK_POSITIONS}, equal amounts)`}
        />
      </Card>

      <Card title="How to buy">
        <Bullets
          items={[
            <>
              Set up a <b>monthly savings plan</b> in your broker for each product (free on Trade Republic). A one-off order costs €1: on €50 that is 2%.
            </>,
            <>Come back once a month. The split above changes so the block that is behind gets more. That is rebalancing without selling.</>,
            <>Don&apos;t check the portfolio every day. The plan works by being consistent, not by timing the market.</>,
          ]}
        />
      </Card>

      <Card id="projection" title="Where this could take you" sub="A range of outcomes for your plan, not a promise. Stocks can fall by half along the way.">
        <WealthProjection start={res?.totals.value ?? 0} monthly={pf.settings.monthly_contribution} targets={t} choices={choices} />
      </Card>

      <Card id="core" title={`1. ${BUCKET_NAME.core} (${pct(t.core, 0, false)})`} sub="The base: the world stock market at the lowest cost. No stock picking here.">
        <CoreChooser current={core.isin} stats={stats} />
        <div className="mt-4">
          <Bullets
            items={[
              <>
                <b>Pick one and stay.</b> The options differ by tenths of a percent. In Spain an ETF cannot be switched without paying tax, so changing ETF later means selling and paying tax on
                the gains.
              </>,
              <>
                <b>Always the accumulating class:</b> it reinvests dividends inside the fund, so you pay no tax until you sell.
              </>,
            ]}
          />
        </div>
      </Card>

      <Card id="diversifiers" title={`2. ${BUCKET_NAME.gold} (${pct(t.gold, 0, false)})`} sub="Assets that behave differently from stocks. Pick one or mix them; the numbers show how each has really behaved.">
        <Callout tone="info" title="What actually protects you">
          Gold is the asset with the best record of holding up when stocks crash, but over decades it barely beats inflation. Short euro government bonds barely move at all: they are the
          steadiest option. Broad commodities help in an inflation shock. Silver and bitcoin swing far more than stocks: they are bets, not protection. Oil is not offered: it is only
          available through futures, whose rolling costs have destroyed long-term returns.
        </Callout>
        <div className="mt-4">
          <DiversifierPicker current={choices.gold} stats={stats} />
        </div>
      </Card>

      <Card id="momentum" title={`3. ${BUCKET_NAME.momentum} (${pct(t.momentum, 0, false)})`} sub="The active part: companies with the strongest trend and solid finances. The riskiest, so the smallest.">
        <Callout tone="info" title="Isn't buying what went up buying expensive?">
          Momentum means buying what has risen, and decades of data show that recent winners tend to keep beating the market for several months. What does not work is buying the spike of a
          sudden jump, so the radar marks those as <b>Wait for a dip</b>. On top of that, every buy candidate must pass strict checks on its last annual report: profitable, earnings backed by
          cash, no risk of financial distress, no heavy dilution and not absurdly expensive.
        </Callout>
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[15px] font-semibold">
            {route === "etf" ? `Recommended now (under ${money(MIN_SLEEVE_FOR_STOCKS_EUR, "EUR", 0)} in this block): a momentum ETF` : "Simple option: a momentum ETF"}
          </p>
          <ProductCard p={momEtf} />
          <p className="mt-2 text-[15px] font-semibold">{route === "stocks" ? "Recommended now: stocks from the radar" : "Later, with more money: stocks from the radar"}</p>
          <Bullets
            items={[
              <>
                <b>Buy</b> only <ActionPill action="candidate" />, in equal amounts, up to {STOCK_POSITIONS}. Never more than 10% of the block in one company.
              </>,
              <>
                <b>Not yet:</b> <ActionPill action="wait" /> (it just jumped) and <ActionPill action="watch" /> (something is missing: often a weak annual report).
              </>,
              <>
                <b>Sell</b> when a holding shows &ldquo;Consider selling&rdquo;: it left the top half of the market or turned <ActionPill action="avoid" />. Do not sell just because it stopped being a
                candidate; that slack avoids buying and selling all the time (and paying tax for it).
              </>,
              <>
                <b>Losses and buying back:</b> if you sell at a loss and buy the same share again within 2 months (1 year for shares listed only in the US), Spain does not let you use that loss
                this year. The portfolio warns you.
              </>,
            ]}
          />
          {candidates.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-[18px] bg-surface-2">
              <p className="px-4 pt-3 text-[13.5px] text-ink-2">Buy candidates today (close of {dateLabel(latest?.data_asof)})</p>
              <ul className="divide-y divide-line">
                {candidates.map((r) => (
                  <li key={r.t}>
                    <Link href={`/research/${r.t}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-3 active:bg-surface-3">
                      <AssetAvatar t={r.t} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{r.n}</span>
                        <span className="block truncate text-[12.5px] text-ink-2">
                          {r.t} · momentum {Math.round(r.ov)} · fundamentals {r.fund === null || r.fund === undefined ? "n/a" : Math.round(r.fund)}
                          {r.pe ? ` · P/E ${Math.round(r.pe)}` : ""}
                        </span>
                      </span>
                      <DeltaPill v={r.r6m} />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/radar?preset=buy" className="block px-4 py-3 text-[14px] font-medium text-accent">
                See all on the radar
              </Link>
            </div>
          )}
        </div>
      </Card>

      <Card id="cash" title={`4. ${BUCKET_NAME.cash} (${pct(t.cash ?? 0, 0, false)}, optional)`} sub="Money you may need in the next few years, kept safe. Not an investment: after inflation it barely grows.">
        <Bullets
          items={[
            <>
              <b>Usually 0%.</b> Over long periods cash loses to inflation, and the diversifiers already soften falls. Keep cash for an emergency fund (3-6 months of spending) or for
              something you will pay within ~3 years: that money should not be in stocks.
            </>,
            <>
              To hold it as part of the plan, set a <b>Cash %</b> in{" "}
              <Link href="/settings?tab=portfolio" className="text-accent">
                Settings → Target mix
              </Link>
              . Then the cash in your broker account (and any money-market ETF you mark as Cash) counts towards it, and the monthly split tops it up when it falls behind.
            </>,
            <>
              <b>Tax:</b> account interest is taxed every year (Trade Republic&apos;s Spanish branch withholds 19%). A money-market ETF that reinvests is taxed only when you sell, as a capital
              gain.
            </>,
          ]}
        />
        <div className="mt-4">
          <CashPicker current={choices.cash} />
        </div>
      </Card>

      <Card id="taxes" title="Taxes in Spain (summary)" sub="General information as of today. Not a substitute for a tax adviser.">
        <Bullets
          items={[
            <>
              All investment income goes to the <b>savings base</b> of IRPF: 19% up to €6,000, 21% to €50,000, 23% to €200,000, 27% to €300,000 and 30% above (rates since 2025).
            </>,
            <>
              <b>ETFs, index funds and shares:</b> you pay tax only when you sell, on the difference between what you get and what you paid (fees included). If you bought in several goes,
              the oldest shares count as sold first (FIFO); the portfolio does this for you. No tax is withheld on sales: you declare it.
            </>,
            <>
              <b>Gold and silver ETCs:</b> Spain&apos;s tax authority (binding ruling V0267-25, 13 Mar 2025) treats them as <b>capital income</b> (rendimientos del capital mobiliario), not
              capital gains, because they are debt securities. Same rates; the difference is that losses of one kind only offset up to 25% of gains of the other. Crypto ETPs are very likely
              treated the same way.
            </>,
            <>
              <b>Index funds</b> (not ETFs) can be switched to another fund without paying tax (traspaso). That is their main advantage in Spain.
            </>,
            <>
              <b>US dividends:</b> the US withholds 15% (with the W-8BEN form your broker handles) and you deduct that in your tax return. Trade Republic&apos;s Spanish branch also withholds 19% on
              interest and dividends.
            </>,
            <>
              <b>US-listed ETFs (SPY, QQQ…):</b> EU retail investors cannot buy them (PRIIPs). That is why only European UCITS products appear here.
            </>,
            <>
              <b>Modelo 720:</b> if your securities held abroad exceed €50,000 on 31 December you must report them. Ask your broker whether yours count as held outside Spain.
            </>,
          ]}
        />
      </Card>

      <p className="px-1 text-[12.5px] text-ink-3">
        Product data checked on {dateLabel(VERIFIED_ON)} on issuer sites and data providers (justETF, extraETF, Finanzfluss). Fees change: read the KID before buying and check the product is
        available at your broker. Behaviour figures use US-listed funds as a measuring stick (you cannot buy those). WarrenIA is an analysis tool, not a financial adviser.
      </p>
    </div>
  );
}
