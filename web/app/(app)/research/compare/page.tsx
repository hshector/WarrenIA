import Link from "next/link";

import { Delta, ScoreCell, StatePill, Ticker } from "@/components/fin/fin";
import { CompareChart } from "@/components/research/compare-chart";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, Panel } from "@/components/ui/primitives";
import { compactUsd, num, pct } from "@/lib/format";
import { getAssets, loadMarket } from "@/lib/market/source";
import type { RadarRow } from "@/lib/market/types";

export const metadata = { title: "Comparar" };

type RowDef = [string, (r: RadarRow) => React.ReactNode];

const ROWS: { group: string; rows: RowDef[] }[] = [
  {
    group: "Ranking",
    rows: [
      ["Estado", (r) => <StatePill state={r.st} short />],
      ["Rank", (r) => <span className="num">#{r.rank}</span>],
      ["Overall", (r) => <ScoreCell v={r.ov} />],
      ["Momentum", (r) => <ScoreCell v={r.m} />],
      ["Trend Quality", (r) => <ScoreCell v={r.tq} />],
      ["Acceleration", (r) => <ScoreCell v={r.a} />],
      ["Risk (0 = menor)", (r) => <ScoreCell v={r.rk} invert />],
    ],
  },
  {
    group: "Rentabilidad",
    rows: [
      ["1 mes", (r) => <Delta v={r.r1m} />],
      ["3 meses", (r) => <Delta v={r.r3m} />],
      ["6 meses", (r) => <Delta v={r.r6m} />],
      ["12 meses", (r) => <Delta v={r.r12m} />],
      ["12-1 meses", (r) => <Delta v={r.r12_1} />],
    ],
  },
  {
    group: "Riesgo y liquidez",
    rows: [
      ["Volatilidad 63d", (r) => <span className="num">{pct(r.vol, 0, false)}</span>],
      ["Drawdown máx. 12m", (r) => <span className="num">{pct(r.mdd, 0, false)}</span>],
      ["Beta", (r) => <span className="num">{num(r.beta)}</span>],
      ["Distancia a máx. 52s", (r) => <span className="num">{pct(r.d52, 1, false)}</span>],
      ["Vol. monetario medio", (r) => <span className="num">{compactUsd(r.adv)}</span>],
      ["Capitalización", (r) => <span className="num">{compactUsd(r.mcap)}</span>],
    ],
  },
];

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const sp = await searchParams;
  const tickers = (sp.t ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 4);
  const { latest, meta } = await loadMarket();
  const assets = await getAssets(latest, tickers);
  const found = tickers.filter((t) => assets[t]);
  return (
    <>
      <PageHeader title="Comparar activos" sub="Hasta 4 activos. Selecciónalos con las casillas del Momentum Radar." />
      {found.length < 1 || !meta ? (
        <EmptyState title="Nada que comparar" action={<Link className="text-accent" href="/radar">Ir al Momentum Radar</Link>}>
          Añade tickers a la URL (?t=AAA,BBB) o selecciónalos en el radar.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <Panel title="Evolución relativa">
            <CompareChart sessions={meta.sessions} series={found.map((t) => ({ t, c: assets[t].series?.c ?? [] }))} />
          </Panel>
          <Panel pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 text-left md:px-5" />
                    {found.map((t) => (
                      <th key={t} className="px-3 py-3 text-right font-normal">
                        <Link href={`/research/${t}`} className="hover:text-accent">
                          <Ticker t={t} />
                        </Link>
                        <div className="truncate text-[11.5px] text-ink-3">{assets[t].row.n}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                {ROWS.map((g) => (
                  <tbody key={g.group}>
                    <tr>
                      <td colSpan={found.length + 1} className="t-label px-4 pb-1.5 pt-4 md:px-5">
                        {g.group}
                      </td>
                    </tr>
                    {g.rows.map(([label, fn]) => (
                      <tr key={label} className="border-t border-line">
                        <td className="px-4 py-2 text-ink-2 md:px-5">{label}</td>
                        {found.map((t) => (
                          <td key={t} className="px-3 py-2 text-right">
                            {assets[t].eligible || g.group !== "Ranking" ? fn(assets[t].row) : <span className="text-ink-3">no elegible</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </Panel>
          {tickers.length > found.length && <p className="t-meta">No encontrados en la última ejecución: {tickers.filter((t) => !assets[t]).join(", ")}</p>}
        </div>
      )}
    </>
  );
}
