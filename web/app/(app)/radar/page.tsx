import { RadarView } from "@/components/radar/radar-view";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/primitives";
import { getRadar, loadMarket } from "@/lib/market/source";
import { heldTickers } from "@/lib/user/holdings";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Radar" };

export default async function RadarPage({ searchParams }: { searchParams: Promise<{ cls?: string; preset?: string }> }) {
  const sp = await searchParams;
  const { latest, meta } = await loadMarket();
  const radar = await getRadar(latest);
  const store = await requireStore();
  const [held, watch] = await Promise.all([heldTickers(store), store.watchlist()]);

  if (!latest || !radar || !meta) {
    return (
      <>
        <PageHeader title="Radar" />
        <EmptyState title="Todavía no hay datos">El primer cálculo aparece cuando termina la descarga inicial de datos (unas 2 horas tras configurarla).</EmptyState>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Radar" sub="Acciones con más fuerza de tendencia ahora mismo." />
      <RadarView
        rows={radar.rows}
        bench={radar.bench}
        benchmarks={meta.benchmarks}
        primary={meta.primary_benchmark}
        held={held.tickers}
        watch={watch.map((w) => w.ticker)}
        initial={{ cls: sp.cls, preset: sp.preset }}
      />
    </>
  );
}
