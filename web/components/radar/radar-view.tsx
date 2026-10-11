"use client";

import Link from "next/link";
import { Dialog } from "radix-ui";
import { useMemo, useState } from "react";

import { AssetAvatar, Delta, DeltaPill, StatePill } from "@/components/fin/fin";
import { IconFilter, IconSearch } from "@/components/ui/icons";
import { Button, cx, Field, Input, Segmented, Select } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { applyRadar, DEFAULT_FILTERS, PRESETS, riskLabel, type Filters, type Horizon, type PresetKey } from "@/lib/market/radar";
import { STATE_SIMPLE, type BenchReturns, type RadarRow, type StateKey } from "@/lib/market/types";

const PAGE = 40;
const H_LABEL: Record<Horizon, string> = { r1m: "1 mes", r3m: "3 meses", r6m: "6 meses", r12m: "1 año" };

export function RadarView({
  rows,
  bench,
  primary,
  held,
  watch,
  initial,
}: {
  rows: RadarRow[];
  bench: BenchReturns;
  benchmarks: Record<string, string>;
  primary: string;
  held: string[];
  watch: string[];
  initial: { cls?: string; preset?: string };
}) {
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, cls: initial.cls === "etf" ? "etf" : "stock" });
  const [presetKey, setPresetKey] = useState<PresetKey>((PRESETS.find((p) => p.key === initial.preset)?.key ?? "all") as PresetKey);
  const [horizon, setHorizon] = useState<Horizon>("r6m");
  const [n, setN] = useState(PAGE);
  const preset = PRESETS.find((p) => p.key === presetKey)!;
  const heldSet = useMemo(() => new Set(held), [held]);
  const watchSet = useMemo(() => new Set(watch), [watch]);
  const data = useMemo(
    () => applyRadar(rows, filters, preset, preset.sort, { horizon, bench, benchmark: primary, held: heldSet, watch: watchSet }),
    [rows, filters, preset, horizon, bench, primary, heldSet, watchSet],
  );
  const sectors = useMemo(() => [...new Set(rows.filter((r) => r.cls === filters.cls).map((r) => r.sec ?? "—"))].sort(), [rows, filters.cls]);
  const active = filters.sectors.length + filters.states.length + (filters.minMcap ? 1 : 0) + (filters.minAdv ? 1 : 0) + (filters.maxRisk < 100 ? 1 : 0) + (filters.onlyHeld ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          ariaLabel="Tipo de activo"
          value={filters.cls}
          onChange={(v) => {
            setFilters((f) => ({ ...f, cls: v, sectors: [] }));
            setN(PAGE);
          }}
          options={[
            { value: "stock", label: "Acciones" },
            { value: "etf", label: "ETFs" },
          ]}
          className="w-full sm:w-auto"
        />
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <IconSearch size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input
              aria-label="Buscar"
              placeholder="Buscar"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="h-10 bg-surface pl-10 shadow-[var(--shadow-card)]"
            />
          </div>
          <FiltersSheet filters={filters} setFilters={setFilters} sectors={sectors} count={active} horizon={horizon} setHorizon={setHorizon} />
        </div>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              setPresetKey(p.key);
              setN(PAGE);
            }}
            title={p.question}
            className={cx(
              "tap h-9 shrink-0 rounded-full px-4 text-[14px] font-medium",
              presetKey === p.key ? "bg-ink text-surface" : "bg-surface text-ink-2 shadow-[var(--shadow-card)] hover:text-ink",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="text-[13.5px] text-ink-2">
        {preset.key === "all" ? "Ordenadas por su puntuación de momentum (0‑100)." : preset.question} · {data.length} resultados
        {preset.note && <span className="text-warn"> · {preset.note}</span>}
      </p>

      {data.length === 0 ? (
        <div className="card px-6 py-12 text-center text-[15px] text-ink-2">
          {preset.key === "watch" ? "Aún no sigues ningún activo. Abre uno y pulsa «Seguir»." : "Ningún activo cumple estos filtros."}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[36px_minmax(0,1fr)_150px_80px_100px_56px] items-center gap-3 border-b border-line px-5 py-3 text-[12.5px] text-ink-3 md:grid">
            <span>#</span>
            <span>Activo</span>
            <span>Estado</span>
            <span className="text-right">Riesgo</span>
            <span className="text-right">{H_LABEL[horizon]}</span>
            <span className="text-right">Puntos</span>
          </div>
          <ul className="divide-y divide-line">
            {data.slice(0, n).map((r) => {
              const risk = riskLabel(r.rk);
              return (
                <li key={r.t}>
                  <Link
                    href={`/research/${encodeURIComponent(r.t)}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 active:bg-surface-3 md:grid-cols-[36px_minmax(0,1fr)_150px_80px_100px_56px] md:px-5"
                  >
                    <span className="num hidden text-[14px] text-ink-3 md:block">{r.rank}</span>
                    <span className="flex min-w-0 items-center gap-3">
                      <AssetAvatar t={r.t} />
                      <span className="min-w-0">
                        <span className="block truncate text-[15.5px] font-semibold tracking-[-0.01em]">{r.n}</span>
                        <span className="block truncate text-[13px] text-ink-2">
                          {r.t}
                          <span className="md:hidden"> · {STATE_SIMPLE[r.st]}</span>
                          {heldSet.has(r.t) && <span className="text-accent-2"> · En cartera</span>}
                          {watchSet.has(r.t) && !heldSet.has(r.t) && <span className="text-ink-3"> · Siguiendo</span>}
                        </span>
                      </span>
                    </span>
                    <span className="hidden md:block">
                      <StatePill state={r.st} />
                    </span>
                    <span className={cx("hidden text-right text-[14px] font-medium md:block", risk.cls)}>{risk.text}</span>
                    <span className="flex flex-col items-end md:hidden">
                      <span className="num text-[17px] font-bold tracking-[-0.01em]">{Math.round(r.ov)}</span>
                      <Delta v={r[horizon]} className="text-[13px] font-medium" />
                    </span>
                    <span className="hidden text-right md:block">
                      <DeltaPill v={r[horizon]} />
                    </span>
                    <span className="num hidden text-right text-[17px] font-bold tracking-[-0.01em] md:block">{Math.round(r.ov)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {n < data.length && (
            <button onClick={() => setN(n + PAGE)} className="w-full border-t border-line py-4 text-[15px] font-medium text-accent transition-colors hover:bg-surface-2 active:bg-surface-3">
              Ver más
            </button>
          )}
        </div>
      )}
      <p className="text-[12.5px] text-ink-3">
        La puntuación compara cada activo con el resto del universo usando precios de cierre: fuerza de tendencia, calidad, aceleración y riesgo. No es una recomendación ni un análisis de la
        empresa.
      </p>
    </div>
  );
}

const STATES: StateKey[] = ["strong", "improving", "breakout", "extended", "weakening", "speculative", "neutral"];

function FiltersSheet({
  filters,
  setFilters,
  sectors,
  count,
  horizon,
  setHorizon,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  sectors: string[];
  count: number;
  horizon: Horizon;
  setHorizon: (h: Horizon) => void;
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <Sheet
      title="Filtros"
      description="Filtra y ajusta la lista del radar"
      size="sm"
      trigger={
        <button
          aria-label="Filtros"
          className={cx("tap inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium shadow-[var(--shadow-card)]", count ? "bg-ink text-surface" : "bg-surface text-ink")}
        >
          <IconFilter size={17} /> Filtros{count ? ` · ${count}` : ""}
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Rentabilidad mostrada">
          <Select value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon)}>
            {(Object.keys(H_LABEL) as Horizon[]).map((h) => (
              <option key={h} value={h}>
                {H_LABEL[h]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Riesgo máximo">
          <Select value={filters.maxRisk} onChange={(e) => set("maxRisk", Number(e.target.value))}>
            <option value={100}>Cualquiera</option>
            <option value={66}>Bajo o medio</option>
            <option value={33}>Solo bajo</option>
          </Select>
        </Field>
        {filters.cls === "stock" && (
          <Field label="Tamaño de la empresa">
            <Select value={filters.minMcap} onChange={(e) => set("minMcap", Number(e.target.value))}>
              <option value={0}>Todas (desde 2.000 M$)</option>
              <option value={10e9}>Grandes (desde 10.000 M$)</option>
              <option value={50e9}>Muy grandes (desde 50.000 M$)</option>
            </Select>
          </Field>
        )}
        <Field label="Liquidez mínima">
          <Select value={filters.minAdv} onChange={(e) => set("minAdv", Number(e.target.value))}>
            <option value={0}>Cualquiera</option>
            <option value={50e6}>Alta (desde 50 M$ al día)</option>
            <option value={200e6}>Muy alta (desde 200 M$ al día)</option>
          </Select>
        </Field>
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Estado</p>
          <div className="flex flex-wrap gap-2">
            {STATES.map((s) => (
              <button key={s} onClick={() => set("states", toggle(filters.states, s))} className={cx("tap rounded-full", filters.states.length > 0 && !filters.states.includes(s) && "opacity-40")}>
                <StatePill state={s} />
              </button>
            ))}
          </div>
        </div>
        {filters.cls === "stock" && sectors.length > 1 && (
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">Sector</p>
            <div className="flex flex-wrap gap-2">
              {sectors.map((s) => (
                <button
                  key={s}
                  onClick={() => set("sectors", toggle(filters.sectors, s))}
                  className={cx("tap h-8 rounded-full px-3 text-[13px] font-medium", filters.sectors.includes(s) ? "bg-ink text-surface" : "bg-surface-2 text-ink-2")}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="flex items-center justify-between text-[15px]">
          Solo lo que tengo en cartera
          <input type="checkbox" checked={filters.onlyHeld} onChange={(e) => set("onlyHeld", e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
        </label>
      </div>
      <div className="mt-6 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, cls: f.cls, search: f.search }))}>
          Restablecer
        </Button>
        <Dialog.Close asChild>
          <Button variant="primary" className="flex-1">
            Ver resultados
          </Button>
        </Dialog.Close>
      </div>
    </Sheet>
  );
}
