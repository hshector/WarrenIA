import Link from "next/link";

import { signOut } from "@/app/login/actions";
import { SettingsForm } from "@/components/portfolio/forms";
import { BacktestChart } from "@/components/settings/backtest-chart";
import { PageHeader } from "@/components/shell/page-header";
import { RefreshButton } from "@/components/shell/refresh-button";
import { ThemePicker } from "@/components/shell/theme";
import { IconChevronRight, IconLogout } from "@/components/ui/icons";
import { Badge, Button, Callout, EmptyState, Panel } from "@/components/ui/primitives";
import { dateLabel, dateTimeLabel, int, num, pct } from "@/lib/format";
import { computeFreshness } from "@/lib/market/freshness";
import { getBacktest, getExcluded, loadMarket } from "@/lib/market/source";
import type { Meta } from "@/lib/market/types";
import { appMode } from "@/lib/supabase/env";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Datos y ajustes" };

const TABS = [
  ["data", "Estado de los datos"],
  ["method", "Cómo se calcula"],
  ["backtest", "Validación histórica"],
  ["portfolio", "Objetivo de cartera"],
  ["account", "Cuenta"],
] as const;

const SCORE_LABEL: Record<string, string> = { momentum: "Momentum Score", trend_quality: "Trend Quality", acceleration: "Acceleration Score", risk: "Risk Score (0 = menor riesgo)", inverse_risk: "100 − Risk" };

const MENU: { group: string; items: { href: string; label: string; sub: string }[] }[] = [
  {
    group: "Datos",
    items: [
      { href: "/settings?tab=data", label: "Estado de los datos", sub: "Fecha, fuentes y cobertura" },
      { href: "/settings?tab=method", label: "Cómo se calcula", sub: "Metodología del radar" },
      { href: "/settings?tab=backtest", label: "Validación histórica", sub: "Backtest y sus límites" },
    ],
  },
  {
    group: "Cartera",
    items: [
      { href: "/settings?tab=portfolio", label: "Objetivo y aportación mensual", sub: "75 / 10 / 15 y bandas" },
      { href: "/portfolio/transactions", label: "Operaciones e instrumentos", sub: "Editar o borrar" },
      { href: "/portfolio/import", label: "Importar CSV", sub: "Con vista previa" },
    ],
  },
  { group: "Cuenta", items: [{ href: "/settings?tab=account", label: "Cuenta", sub: "Sesión" }] },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0];
  const { latest, meta } = await loadMarket();
  if (!tab) {
    return (
      <div className="mx-auto max-w-[760px]">
        <PageHeader title="Ajustes" />
        <div className="flex flex-col gap-6">
          <div>
            <p className="mb-2 px-5 text-[13px] font-medium text-ink-2">Apariencia</p>
            <div className="card px-4 py-4">
              <ThemePicker />
              <p className="mt-2.5 px-1 text-[13px] text-ink-3">Automático sigue el modo claro u oscuro de tu móvil.</p>
            </div>
          </div>
          {MENU.map((g) => (
            <div key={g.group}>
              <p className="mb-2 px-5 text-[13px] font-medium text-ink-2">{g.group}</p>
              <div className="card divide-y divide-line overflow-hidden">
                {g.items.map((it) => (
                  <Link key={it.href} href={it.href} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2 active:bg-surface-3">
                    <span>
                      <span className="block text-[15.5px]">{it.label}</span>
                      <span className="block text-[13px] text-ink-3">{it.sub}</span>
                    </span>
                    <IconChevronRight size={18} className="text-ink-3" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <p className="px-5 text-[12.5px] text-ink-3">WarrenIA es una herramienta de análisis: no ejecuta operaciones ni da recomendaciones.</p>
          <p className="-mt-4 px-5 text-[12.5px] text-ink-3">
            Logos de empresas proporcionados por{" "}
            <a href="https://logo.dev" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Logo.dev
            </a>
            .
          </p>
        </div>
      </div>
    );
  }
  const title = TABS.find(([k]) => k === tab)![1];
  return (
    <div className="mx-auto max-w-[960px]">
      <Link href="/settings" className="text-[15px] font-medium text-accent">
        ‹ Ajustes
      </Link>
      <div className="mt-3">
        <PageHeader title={title} />
      </div>
      {tab === "data" && <DataTab latest={latest} meta={meta} q={sp.q} />}
      {tab === "method" && (meta ? <MethodTab meta={meta} /> : <EmptyState title="Sin datos publicados" />)}
      {tab === "backtest" && <BacktestTab />}
      {tab === "portfolio" && <PortfolioTab />}
      {tab === "account" && <AccountTab />}
    </div>
  );
}

async function DataTab({ latest, meta, q }: { latest: Awaited<ReturnType<typeof loadMarket>>["latest"]; meta: Meta | null; q?: string }) {
  if (!latest || !meta) {
    return (
      <EmptyState title="Todavía no hay datos publicados">
        Configura los secretos del repositorio y ejecuta el workflow <code className="font-mono">market-data</code> (ver docs/DEPLOY.md). En local: <code className="font-mono">python -m warrenia_engine demo</code>.
      </EmptyState>
    );
  }
  const fresh = computeFreshness(latest.data_asof, meta.calendar?.sessions);
  const excluded = (await getExcluded(latest)) ?? [];
  const filt = q ? excluded.filter((e) => e.t.includes(q.toUpperCase()) || e.n.toLowerCase().includes(q.toLowerCase())) : excluded;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Última ejecución" actions={<RefreshButton />}>
        <dl className="grid grid-cols-[150px_1fr] gap-y-2 text-[13px]">
          <dt className="text-ink-3">Datos (cierre)</dt>
          <dd>{dateLabel(meta.data_asof)} · NYSE · {meta.data_type}</dd>
          <dt className="text-ink-3">Calculado</dt>
          <dd>{dateTimeLabel(meta.computed_at)} {meta.compute_seconds ? <span className="t-meta">({num(meta.compute_seconds, 0)} s)</span> : null}</dd>
          <dt className="text-ink-3">Frescura</dt>
          <dd className={fresh.status === "stale" ? "text-warn" : fresh.status === "fresh" ? "text-pos" : "text-ink-2"}>{latest.demo ? "Datos de demostración" : fresh.label}</dd>
          <dt className="text-ink-3">Estado</dt>
          <dd>{meta.status === "ok" ? <Badge tone="pos">OK</Badge> : <Badge tone="warn">Con avisos</Badge>} {meta.demo && <Badge tone="accent">DEMO</Badge>}</dd>
          <dt className="text-ink-3">Proveedor</dt>
          <dd>{meta.provider}</dd>
          <dt className="text-ink-3">Ventana de datos</dt>
          <dd className="num">
            {dateLabel(meta.data_window.first_session)} → {dateLabel(meta.data_window.last_session)} ({int(meta.data_window.sessions)} sesiones)
          </dd>
          <dt className="text-ink-3">Rentabilidad total</dt>
          <dd>{meta.total_return ? "Sí (splits y dividendos)" : "No: solo splits (dividendos no disponibles)"}</dd>
          <dt className="text-ink-3">Ejecución</dt>
          <dd className="font-mono text-[12px] text-ink-2">
            {meta.run_id} · cfg {meta.methodology.config_hash}
            {meta.git_sha ? ` · ${meta.git_sha.slice(0, 7)}` : ""}
          </dd>
        </dl>
        {meta.warnings.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {meta.warnings.map((w) => (
              <Callout key={w} tone="warn">
                {w}
              </Callout>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Cobertura del universo" meta={meta.methodology.universe}>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["stock", "etf"] as const).map((c) => (
            <div key={c} className="flex flex-col gap-2">
              <span className="t-label">{c === "stock" ? "Acciones" : "ETFs"}</span>
              <span className="num text-[20px] font-semibold">
                {int(meta.coverage[c].eligible)} <span className="text-[13px] font-normal text-ink-3">elegibles de {int(meta.coverage[c].candidates)}</span>
              </span>
              <ul className="flex flex-col gap-1 text-[12.5px]">
                {Object.entries(meta.coverage[c].excluded_by_reason).map(([r, n]) => (
                  <li key={r} className="flex justify-between gap-3 text-ink-2">
                    <span>{r}</span>
                    <span className="num text-ink-3">{int(n)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Fuentes, coste y frecuencia" className="xl:col-span-2">
        <div className="grid gap-4 text-[13px] text-ink-2 md:grid-cols-2">
          <ul className="flex flex-col gap-2">
            <li><span className="text-ink">Precios EE. UU. (acciones y ETFs):</span> Massive (antes Polygon.io), plan gratuito: fin de día, ~2 años de historia, 5 peticiones/min. Una petición devuelve todo el mercado de una sesión.</li>
            <li><span className="text-ink">Capitalización y sector:</span> SEC EDGAR (oficial, gratuito): acciones en circulación × precio; sector aproximado desde el código SIC (no GICS).</li>
            <li><span className="text-ink">Tipos de cambio:</span> tipos de referencia del BCE (oficiales, diarios).</li>
            <li><span className="text-ink">Precios en EUR de ETFs/ETCs:</span> EODHD, plan gratuito (~20 llamadas/día): suficiente para unos pocos instrumentos de cartera.</li>
          </ul>
          <ul className="flex flex-col gap-2">
            <li><span className="text-ink">Frecuencia:</span> un proceso programado en GitHub Actions tras cada cierre de NYSE (≈ 05:15 UTC, reintento 11:05 UTC) y bajo demanda con «Actualizar» (cada 15 min como máximo).</li>
            <li><span className="text-ink">Tipo de dato:</span> cierre diario. Sin tiempo real ni intradía.</li>
            <li><span className="text-ink">Coste:</span> 0 €/mes en la configuración actual. Ampliar historia (backtest robusto) requiere un plan de pago.</li>
            <li><span className="text-ink">Uso:</span> personal y privado; los datos no se redistribuyen (la app requiere login).</li>
          </ul>
        </div>
      </Panel>
      <Panel title={`Activos excluidos (${int(excluded.length)})`} meta="Cada exclusión mantiene su motivo" className="xl:col-span-2" pad={false}>
        <form className="px-4 pb-3 md:px-5">
          <input type="hidden" name="tab" value="data" />
          <input name="q" defaultValue={q} placeholder="Buscar ticker o nombre" className="h-8 w-56 rounded-[8px] border border-line-2 bg-canvas-2 px-2.5 text-[13px] outline-none pointer-coarse:text-[16px]" />
        </form>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <tbody>
              {filt.slice(0, 300).map((e) => (
                <tr key={e.t + e.cls} className="border-t border-line">
                  <td className="px-4 py-1.5 font-mono text-ink md:px-5">{e.t}</td>
                  <td className="max-w-[260px] truncate px-3 py-1.5 text-ink-3">{e.n}</td>
                  <td className="px-3 py-1.5 text-ink-2">{e.reasons.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filt.length > 300 && <p className="t-meta px-5 py-2">Mostrando 300 de {int(filt.length)}. Usa la búsqueda.</p>}
        </div>
      </Panel>
    </div>
  );
}

function MethodTab({ meta }: { meta: Meta }) {
  const m = meta.methodology;
  const corr = meta.correlation;
  const sens = meta.sensitivity;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Overall Momentum Rank" meta={`Metodología v${m.version} · pesos fijados a priori, no optimizados con el backtest`}>
        <ul className="flex flex-col gap-2">
          {Object.entries(m.overall).map(([k, w]) => (
            <li key={k} className="flex items-center gap-3 text-[13px]">
              <span className="w-44 text-ink-2">{SCORE_LABEL[k] ?? k}</span>
              <span className="h-1.5 flex-1 rounded-full bg-surface-3">
                <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${w * 100}%` }} />
              </span>
              <span className="num w-10 text-right">{Math.round(w * 100)} %</span>
            </li>
          ))}
        </ul>
        <p className="t-meta mt-4">
          Cada score es la media ponderada de percentiles transversales de sus componentes, reexpresada como percentil (0–100) dentro de su clase (acciones o ETFs). El retorno relativo frente a un único
          benchmark no se usa como factor de ranking: restar la misma referencia a todos los activos no cambia el orden (se muestra como contexto).
        </p>
      </Panel>
      <Panel title="Componentes">
        <div className="flex flex-col gap-4">
          {Object.entries(m.scores).map(([s, comps]) => (
            <div key={s}>
              <p className="t-label mb-1.5">{SCORE_LABEL[s] ?? s}</p>
              <ul className="flex flex-col gap-1 text-[12.5px]">
                {Object.entries(comps).map(([k, w]) => (
                  <li key={k} className="flex justify-between gap-3 text-ink-2">
                    <span>{m.labels[k] ?? k}</span>
                    <span className="num text-ink-3">{Math.round(w * 100)} %</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Sensibilidad de los pesos" meta="Perturbación aleatoria (Dirichlet) de los pesos del Overall">
        {sens ? (
          <div className="flex flex-col gap-3 text-[13px]">
            <p className="text-ink-2">
              {sens.samples} variaciones de pesos alrededor de los actuales. Correlación de Spearman con el ranking base: mediana <span className="num text-ink">{num(sens.spearman.median, 3)}</span> (p5 {num(sens.spearman.p05, 3)}). Coincidencia del top-{sens.top_n}: mediana <span className="num text-ink">{pct(sens.topn_overlap.median, 0, false)}</span>, p5 {pct(sens.topn_overlap.p05, 0, false)}, mínimo {pct(sens.topn_overlap.min, 0, false)}.
            </p>
            <p>{sens.passes_target ? <Badge tone="pos">Cumple el objetivo</Badge> : <Badge tone="warn">No cumple el objetivo</Badge>} <span className="t-meta">objetivo declarado: coincidencia mediana ≥ {pct(sens.target_median_topn_overlap, 0, false)}</span></p>
          </div>
        ) : (
          <p className="t-body">Universo insuficiente para el análisis.</p>
        )}
      </Panel>
      <Panel title="Correlación entre componentes" meta="Correlación de rangos en el universo actual (detección de doble conteo)">
        {corr ? (
          <>
            {corr.high_pairs.length > 0 ? (
              <Callout tone="warn" title={`Pares con |ρ| ≥ ${corr.threshold} (revisar)`}>
                {corr.high_pairs.map((p) => `${m.labels[p.a] ?? p.a} ↔ ${m.labels[p.b] ?? p.b}: ${num(p.rho, 2)}`).join(" · ")}
              </Callout>
            ) : (
              <p className="text-[13px] text-pos">Ningún par supera el umbral de {corr.threshold}.</p>
            )}
            <div className="mt-3 overflow-x-auto">
              <table className="text-[10.5px]">
                <tbody>
                  {corr.labels.map((a, i) => (
                    <tr key={a}>
                      <td className="whitespace-nowrap pr-2 text-ink-3">{a}</td>
                      {corr.matrix[i].map((v, j) => {
                        const x = v ?? 0;
                        return (
                          <td key={j} title={`${a} · ${corr.labels[j]}: ${v === null ? "n/d" : v.toFixed(2)}`} className="num h-5 w-7 text-center" style={{ background: x >= 0 ? `rgb(82 127 98 / ${Math.abs(x) * 0.55})` : `rgb(90 110 148 / ${Math.abs(x) * 0.55})` }}>
                            {i === j ? "" : v === null ? "·" : Math.round(x * 10)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="t-meta mt-2">Valores × 10. Verde = correlación positiva, azul = negativa.</p>
            </div>
          </>
        ) : (
          <p className="t-body">No disponible.</p>
        )}
      </Panel>
      <Panel title="Reglas de clasificación" meta="Umbrales explícitos (config/momentum.yaml)" className="xl:col-span-2">
        <div className="grid gap-4 text-[12.5px] md:grid-cols-3">
          {Object.entries(m.classification).map(([k, v]) => (
            <div key={k}>
              <p className="t-label mb-1">{meta.states[k as keyof Meta["states"]] ?? k}</p>
              <ul className="flex flex-col gap-0.5 text-ink-2">
                {Object.entries(v).map(([p, val]) => (
                  <li key={p} className="flex justify-between gap-3">
                    <span className="font-mono text-[11.5px] text-ink-3">{p}</span>
                    <span className="num">{String(val)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

async function BacktestTab() {
  const bt = await getBacktest();
  if (!bt || bt.status !== "ok" || !bt.results) {
    return <EmptyState title="Sin backtest publicado">{bt?.message ?? "El workflow «backtest» se ejecuta los sábados o manualmente desde GitHub Actions."}</EmptyState>;
  }
  const labels: Record<string, string> = { ...(bt.strategies ?? {}) };
  for (const k of Object.keys(bt.results)) if (k.startsWith("bench_")) labels[k] = `Benchmark ${k.slice(6)} (comprar y mantener)`;
  const keys = Object.keys(bt.results);
  const cols: [string, string, (v: number | null) => string][] = [
    ["cagr", "CAGR", (v) => pct(v)],
    ["vol", "Volatilidad", (v) => pct(v, 1, false)],
    ["sharpe", "Sharpe", (v) => num(v)],
    ["max_drawdown", "Max DD", (v) => pct(v, 1, false)],
    ["calmar", "Calmar", (v) => num(v)],
    ["annual_turnover", "Rotación anual", (v) => (v === null || v === undefined ? "—" : `${num(v, 1)}x`)],
    ["total_costs", "Costes", (v) => pct(v, 2, false)],
  ];
  return (
    <div className="flex flex-col gap-4">
      <Callout tone={bt.conclusive ? "info" : "warn"} title={bt.conclusive ? "Backtest" : "Resultados exploratorios, NO concluyentes"}>
        {bt.limitations?.[0]} {bt.demo && "Además, estos resultados usan datos sintéticos de demostración."}
      </Callout>
      <Panel title="Curvas de capital" meta={`${bt.period?.first_signal} → ${bt.period?.end} · ${bt.period?.rebalances} rebalanceos mensuales · ejecución en la apertura siguiente · ${bt.settings?.cost_bps_per_side} pb por lado`}>
        {bt.curves && <BacktestChart dates={bt.curves.dates} series={bt.curves.series} labels={labels} />}
      </Panel>
      <Panel title="Métricas" pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-right text-[11px] uppercase tracking-[0.05em] text-ink-3">
                <th className="px-4 py-2 text-left font-medium md:px-5">Estrategia</th>
                {cols.map(([, l]) => (
                  <th key={l} className="px-3 py-2 font-medium">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k} className="border-b border-line">
                  <td className="px-4 py-2 text-ink-2 md:px-5">{labels[k] ?? k}</td>
                  {cols.map(([c]) => (
                    <td key={c} className="num px-3 py-2 text-right">
                      {cols.find((x) => x[0] === c)![2]((bt.results![k][c] as number | null) ?? null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Por régimen de mercado" meta="Rentabilidad anualizada de la estrategia completa (Overall)">
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {Object.entries((bt.results.overall?.regimes as Record<string, { days: number; ann_return: number | null }>) ?? {}).map(([k, v]) => (
              <li key={k} className="flex justify-between text-ink-2">
                <span>{k}</span>
                <span className="num">
                  {pct(v.ann_return)} <span className="text-ink-3">({v.days} días)</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Limitaciones">
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[13px] text-ink-2 marker:text-ink-3">
            {bt.limitations?.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </Panel>
      </div>
      <p className="t-meta">Resultados históricos simulados. No garantizan resultados futuros. Calculado {dateTimeLabel(bt.computed_at)} con datos al {dateLabel(bt.data_asof)}.</p>
    </div>
  );
}

async function PortfolioTab() {
  const store = await requireStore();
  const s = await store.settings();
  return (
    <Panel title="Pesos objetivo y bandas" meta="Orientativos: no obligan a invertir exactamente esos porcentajes">
      <SettingsForm settings={s} />
    </Panel>
  );
}

async function AccountTab() {
  const store = await requireStore();
  const mode = appMode();
  return (
    <Panel title="Cuenta">
      <div className="flex flex-col gap-3 text-[13px]">
        <p className="text-ink-2">
          {mode === "supabase" ? (
            <>Sesión iniciada como <span className="text-ink">{store.email}</span>. Tus datos están aislados por usuario (Row Level Security).</>
          ) : (
            <>Modo local de desarrollo: datos guardados en <code className="font-mono">web/.data/user.json</code>, sin login. No disponible en Vercel.</>
          )}
        </p>
        {mode === "supabase" && (
          <form action={signOut}>
            <Button type="submit">
              <IconLogout size={15} /> Cerrar sesión
            </Button>
          </form>
        )}
      </div>
    </Panel>
  );
}
