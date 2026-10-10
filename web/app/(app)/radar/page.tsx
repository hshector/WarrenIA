import Link from "next/link";

import { RadarView } from "@/components/radar/radar-view";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/primitives";
import { dateLabel, int } from "@/lib/format";
import { getRadar, loadMarket } from "@/lib/market/source";
import { heldTickers } from "@/lib/user/holdings";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Momentum Radar" };

export default async function RadarPage({ searchParams }: { searchParams: Promise<{ cls?: string; preset?: string }> }) {
  const sp = await searchParams;
  const { latest, meta } = await loadMarket();
  const radar = await getRadar(latest);
  const store = await requireStore();
  const [held, watch] = await Promise.all([heldTickers(store), store.watchlist()]);

  if (!latest || !radar || !meta) {
    return (
      <>
        <PageHeader title="Momentum Radar" />
        <EmptyState title="Aún no hay un ranking publicado">
          El motor de datos todavía no ha publicado resultados. Ejecuta el workflow <code className="font-mono">market-data</code> en GitHub Actions (la primera descarga tarda ~2 h con el plan gratuito) o
          genera datos de demostración en local con <code className="font-mono">python -m warrenia_engine demo</code>.
        </EmptyState>
      </>
    );
  }
  const cov = meta.coverage;
  return (
    <>
      <PageHeader
        title="Momentum Radar"
        sub={
          <>
            Ranking calculado con el cierre del <span className="text-ink">{dateLabel(latest.data_asof)}</span> · {int(cov.stock.eligible)} acciones y {int(cov.etf.eligible)} ETFs
            elegibles de {int(cov.stock.candidates + cov.etf.candidates)} candidatos ·{" "}
            <Link href="/settings?tab=method" className="text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-ink">
              metodología y cobertura
            </Link>
          </>
        }
      />
      <RadarView
        rows={radar.rows}
        bench={radar.bench}
        benchmarks={meta.benchmarks}
        primary={meta.primary_benchmark}
        held={held.tickers}
        watch={watch.map((w) => w.ticker)}
        initial={{ cls: sp.cls, preset: sp.preset }}
      />
      <p className="t-meta mt-4 max-w-3xl">
        Clasificaciones obtenidas con reglas explícitas sobre precios y volumen de cierre. No son predicciones ni recomendaciones de compra o venta; un momentum alto no implica que una empresa sea
        barata, rentable o financieramente sólida.
      </p>
    </>
  );
}
