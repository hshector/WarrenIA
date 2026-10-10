import Link from "next/link";

import { Delta, ScoreCell, StatePill, Ticker } from "@/components/fin/fin";
import { RemoveWatch } from "@/components/research/remove-watch";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, ButtonLink, EmptyState, Panel } from "@/components/ui/primitives";
import { dateLabel, num } from "@/lib/format";
import { getAssets, getRadar, loadMarket } from "@/lib/market/source";
import { STATE_SHORT } from "@/lib/market/types";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Watchlist" };

export default async function WatchlistPage() {
  const { latest } = await loadMarket();
  const store = await requireStore();
  const [watch, radar] = await Promise.all([store.watchlist(), getRadar(latest)]);
  const rows = new Map((radar?.rows ?? []).map((r) => [r.t, r]));
  const missing = watch.filter((w) => !rows.has(w.ticker)).map((w) => w.ticker);
  const extra = missing.length ? await getAssets(latest, missing) : {};
  const changes = watch.map((w) => rows.get(w.ticker)).filter((r) => r && r.pst && r.pst !== r.st);

  return (
    <>
      <PageHeader title="Watchlist" sub={latest ? `Seguimiento con el cierre del ${dateLabel(latest.data_asof)}` : undefined} actions={<ButtonLink href="/radar">Añadir desde el radar</ButtonLink>} />
      {watch.length === 0 ? (
        <EmptyState title="Tu watchlist está vacía" action={<Link href="/radar" className="text-accent">Abrir Momentum Radar</Link>}>
          Marca con la estrella los activos del radar que quieras seguir. Aquí verás sus cambios de estado entre ejecuciones.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {changes.length > 0 && (
            <Panel title="Cambios de estado desde la ejecución anterior">
              <ul className="flex flex-col gap-2">
                {changes.map((r) => (
                  <li key={r!.t} className="flex flex-wrap items-center gap-2 text-[13px]">
                    <Link href={`/research/${r!.t}`}>
                      <Ticker t={r!.t} />
                    </Link>
                    <span className="text-ink-3">{STATE_SHORT[r!.pst!]}</span>
                    <span className="text-ink-3">→</span>
                    <StatePill state={r!.st} short />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-right text-[11px] uppercase tracking-[0.05em] text-ink-3">
                    <th className="px-4 py-2.5 text-left font-medium md:px-5">Activo</th>
                    <th className="px-3 py-2.5 text-left font-medium">Estado</th>
                    <th className="px-3 py-2.5 font-medium">Rank</th>
                    <th className="px-3 py-2.5 font-medium">Precio</th>
                    <th className="px-3 py-2.5 font-medium">1m</th>
                    <th className="px-3 py-2.5 font-medium">6m</th>
                    <th className="px-3 py-2.5 font-medium">Overall</th>
                    <th className="px-3 py-2.5 font-medium">Momentum</th>
                    <th className="px-3 py-2.5 font-medium">Risk</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {watch.map((w) => {
                    const r = rows.get(w.ticker);
                    const ex = extra[w.ticker];
                    return (
                      <tr key={w.ticker} className="border-b border-line">
                        <td className="px-4 py-2.5 md:px-5">
                          <Link href={`/research/${w.ticker}`} className="flex items-center gap-2 hover:text-accent">
                            <Ticker t={w.ticker} />
                            <span className="truncate text-[12.5px] text-ink-3">{r?.n ?? ex?.row.n ?? ""}</span>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">{r ? <StatePill state={r.st} short /> : <Badge>{ex ? "no elegible" : "sin datos"}</Badge>}</td>
                        <td className="num px-3 py-2.5 text-right text-ink-2">{r ? `#${r.rank}` : "—"}</td>
                        <td className="num px-3 py-2.5 text-right">{num(r?.px ?? ex?.row.px)}</td>
                        <td className="px-3 py-2.5 text-right"><Delta v={r?.r1m ?? ex?.row.r1m} /></td>
                        <td className="px-3 py-2.5 text-right"><Delta v={r?.r6m ?? ex?.row.r6m} /></td>
                        <td className="px-3 py-2.5 text-right">{r ? <ScoreCell v={r.ov} /> : "—"}</td>
                        <td className="px-3 py-2.5 text-right">{r ? <ScoreCell v={r.m} /> : "—"}</td>
                        <td className="px-3 py-2.5 text-right">{r ? <ScoreCell v={r.rk} invert /> : "—"}</td>
                        <td className="px-3 py-2.5 text-right"><RemoveWatch ticker={w.ticker} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
