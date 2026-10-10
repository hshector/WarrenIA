import Link from "next/link";
import { redirect } from "next/navigation";

import { StatePill, Ticker } from "@/components/fin/fin";
import { PageHeader } from "@/components/shell/page-header";
import { IconArrowUpRight, IconSearch } from "@/components/ui/icons";
import { EmptyState, Input, Panel } from "@/components/ui/primitives";
import { dateLabel } from "@/lib/format";
import { PRESETS } from "@/lib/market/radar";
import { loadMarket } from "@/lib/market/source";

export const metadata = { title: "Research" };

async function go(form: FormData) {
  "use server";
  const t = String(form.get("t") ?? "").trim().toUpperCase();
  if (/^[A-Z0-9.\-]{1,12}$/.test(t)) redirect(`/research/${t}`);
  redirect("/research");
}

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ cls?: string }> }) {
  const sp = await searchParams;
  const cls = sp.cls === "etf" ? "etf" : "stock";
  const { latest, meta } = await loadMarket();
  const reports = meta?.reports?.[cls] ?? [];
  return (
    <>
      <PageHeader
        title="Research"
        sub={latest ? <>Informes de las candidatas destacadas · cierre del {dateLabel(latest.data_asof)}. Cada cifra procede del cálculo reproducible de esta ejecución.</> : undefined}
        actions={
          <form action={go} className="relative w-full sm:w-64">
            <IconSearch size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input name="t" placeholder="Abrir ficha por ticker" className="pl-8" aria-label="Ticker" />
          </form>
        }
      />
      <div className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {PRESETS.filter((p) => p.key !== "all").map((p) => (
          <Link key={p.key} href={`/radar?preset=${p.key}&cls=${cls}`} className="group flex items-center justify-between gap-3 rounded-[10px] border border-line bg-surface px-4 py-3 transition-colors hover:border-line-2 hover:bg-surface-2">
            <span className="text-[13px] text-ink-2 group-hover:text-ink">{p.question}</span>
            <IconArrowUpRight size={15} className="shrink-0 text-ink-3 group-hover:text-accent" />
          </Link>
        ))}
      </div>
      <div className="mb-3 flex gap-2 text-[13px]">
        <Link href="/research" className={cls === "stock" ? "text-ink" : "text-ink-3 hover:text-ink-2"}>
          Acciones
        </Link>
        <span className="text-ink-3">·</span>
        <Link href="/research?cls=etf" className={cls === "etf" ? "text-ink" : "text-ink-3 hover:text-ink-2"}>
          ETFs
        </Link>
      </div>
      {!reports.length ? (
        <EmptyState title="Sin informes publicados">Los informes se generan en cada ejecución del motor de datos.</EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {reports.map((r) => (
            <Panel key={r.ticker}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="num text-[12px] text-ink-3">#{r.rank}</span>
                    <Ticker t={r.ticker} className="text-[15px]" />
                    <StatePill state={r.state} short />
                  </div>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{r.name}</p>
                </div>
                <Link href={`/research/${r.ticker}`} className="inline-flex shrink-0 items-center gap-1 text-[12.5px] text-accent hover:text-accent-2">
                  Informe <IconArrowUpRight size={14} />
                </Link>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{r.thesis[0]}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{r.thesis[1]}</p>
              {r.risks[0] && (
                <p className="mt-2.5 border-t border-line pt-2.5 text-[12.5px] text-ink-3">
                  <span className="text-warn">Riesgo · </span>
                  {r.risks[0]}
                </p>
              )}
            </Panel>
          ))}
        </div>
      )}
      <p className="t-meta mt-5">Informes deterministas generados a partir de métricas: no son análisis fundamental. {meta ? `Metodología v${meta.methodology.version} · config ${meta.methodology.config_hash}` : ""}</p>
    </>
  );
}
