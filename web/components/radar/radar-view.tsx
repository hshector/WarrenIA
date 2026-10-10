"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { toggleWatch } from "@/app/(app)/actions";
import { Delta, ScoreBar, StatePill, Ticker } from "@/components/fin/fin";
import { IconChevronDown, IconCompare, IconFilter, IconSearch, IconWatch, IconWatchFilled } from "@/components/ui/icons";
import { Button, cx, Input, Segmented, Select } from "@/components/ui/primitives";
import { score } from "@/lib/format";
import { applyRadar, DEFAULT_FILTERS, PRESETS, type Filters, type Horizon, type PresetKey, type SortKey } from "@/lib/market/radar";
import { STATE_LABELS, type BenchReturns, type RadarRow, type StateKey } from "@/lib/market/types";

import { COLS, COLUMN_PRESETS, horizonLabel, type ColCtx, type ColumnPreset } from "./columns";
import { QuickView } from "./quick-view";

const STATES: StateKey[] = ["strong", "improving", "breakout", "extended", "weakening", "speculative", "neutral"];
const ROW_H = 46;

function useIsDesktop() {
  const [d, setD] = useState(true);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 900px)");
    const f = () => setD(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return d;
}

export function RadarView({
  rows,
  bench,
  benchmarks,
  primary,
  held,
  watch: initialWatch,
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
  const router = useRouter();
  const desktop = useIsDesktop();
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, cls: initial.cls === "etf" ? "etf" : "stock" });
  const [presetKey, setPresetKey] = useState<PresetKey>((PRESETS.find((p) => p.key === initial.preset)?.key ?? "all") as PresetKey);
  const preset = PRESETS.find((p) => p.key === presetKey)!;
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>(preset.sort);
  const [horizon, setHorizon] = useState<Horizon>("r6m");
  const [benchmark, setBenchmark] = useState(primary);
  const [colPreset, setColPreset] = useState<ColumnPreset>("compact");
  const [selected, setSelected] = useState<string[]>([]);
  const [watch, setWatch] = useState(() => new Set(initialWatch));
  const [quick, setQuick] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const heldSet = useMemo(() => new Set(held), [held]);

  const ctx: ColCtx = { horizon, bench, benchmark, held: heldSet, watch, twoLine: colPreset === "compact" };
  const data = useMemo(
    () => applyRadar(rows, filters, preset, sort, { horizon, bench, benchmark, held: heldSet, watch }),
    [rows, filters, preset, sort, horizon, bench, benchmark, heldSet, watch],
  );
  const sectors = useMemo(() => [...new Set(rows.filter((r) => r.cls === filters.cls).map((r) => r.sec ?? "—"))].sort(), [rows, filters.cls]);
  const totalCls = rows.filter((r) => r.cls === filters.cls).length;

  function choosePreset(k: PresetKey) {
    setPresetKey(k);
    setSort(PRESETS.find((p) => p.key === k)!.sort);
  }
  function onSort(key?: SortKey) {
    if (!key) return;
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "rank" || key === "rk" || key === "t" ? "asc" : "desc" }));
  }
  function flipWatch(t: string) {
    const on = !watch.has(t);
    setWatch((w) => {
      const n = new Set(w);
      if (on) n.add(t);
      else n.delete(t);
      return n;
    });
    startTransition(() => {
      toggleWatch(t, on).catch(() => setWatch((w) => new Set(on ? [...w].filter((x) => x !== t) : [...w, t])));
    });
  }
  function toggleSel(t: string) {
    setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : s.length >= 4 ? s : [...s, t]));
  }
  const activeFilters =
    filters.sectors.length + filters.states.length + (filters.minMcap ? 1 : 0) + (filters.minAdv ? 1 : 0) + (filters.maxRisk < 100 ? 1 : 0) + (filters.maxVol < 10 ? 1 : 0) + (filters.onlyHeld ? 1 : 0) + (filters.onlyWatch ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Class + questions */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          ariaLabel="Tipo de activo"
          value={filters.cls}
          onChange={(v) => setFilters((f) => ({ ...f, cls: v, sectors: [] }))}
          options={[
            { value: "stock", label: "Acciones" },
            { value: "etf", label: "ETFs" },
          ]}
        />
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 md:pb-0">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => choosePreset(p.key)}
              title={p.question}
              className={cx(
                "h-8 shrink-0 rounded-full border px-3 text-[12.5px] transition-colors",
                presetKey === p.key ? "border-accent-line bg-accent-soft text-ink" : "border-line-2 text-ink-2 hover:border-line-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-panel)] border border-line bg-surface px-3 py-2.5">
        <div className="relative w-full sm:w-56">
          <IconSearch size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input aria-label="Buscar" placeholder="Ticker o nombre" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} className="h-8 pl-8" />
        </div>
        <FilterPopover filters={filters} setFilters={setFilters} sectors={sectors} count={activeFilters} />
        <span className="mx-1 hidden h-5 w-px bg-line-2 md:block" />
        <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
          Horizonte
          <Segmented size="sm" value={horizon} onChange={setHorizon} options={(["r1m", "r3m", "r6m", "r12m"] as Horizon[]).map((h) => ({ value: h, label: horizonLabel(h) }))} />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
          vs
          <Select aria-label="Benchmark" value={benchmark} onChange={(e) => setBenchmark(e.target.value)} className="h-8" title={benchmarks[benchmark]}>
            {Object.keys(benchmarks).map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </label>
        {desktop && (
          <div className="ml-auto">
            <Segmented size="sm" ariaLabel="Columnas" value={colPreset} onChange={setColPreset} options={(Object.keys(COLUMN_PRESETS) as ColumnPreset[]).map((k) => ({ value: k, label: COLUMN_PRESETS[k].label }))} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2 px-0.5">
        <p className="t-meta">
          <span className="text-ink-2">{preset.question}</span> · {data.length} de {totalCls} {filters.cls === "stock" ? "acciones" : "ETFs"} elegibles
          {sort.key !== preset.sort.key && <> · ordenado por {String(sort.key)}</>}
        </p>
        {preset.note && <p className="t-meta text-warn">{preset.note}</p>}
      </div>

      {desktop ? (
        <DesktopTable data={data} ctx={ctx} cols={COLUMN_PRESETS[colPreset].cols.map((c) => (c === "ret" ? { ...COLS.ret, label: horizonLabel(horizon) } : c === "rel" ? { ...COLS.rel, label: `vs ${benchmark}` } : COLS[c]))} sort={sort} onSort={onSort} selected={selected} toggleSel={toggleSel} watch={watch} flipWatch={flipWatch} onOpen={setQuick} />
      ) : (
        <MobileList data={data} horizon={horizon} watch={watch} onOpen={(t) => router.push(`/research/${encodeURIComponent(t)}`)} />
      )}

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto flex w-fit items-center gap-3 rounded-full border border-line-2 bg-surface-2/95 py-1.5 pl-4 pr-1.5 shadow-[0_8px_30px_rgb(0_0_0/0.45)] backdrop-blur lg:bottom-6">
          <span className="text-[12.5px] text-ink-2">
            {selected.map((s) => (
              <Ticker key={s} t={s} className="mr-2 text-[12px]" />
            ))}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Limpiar
          </Button>
          <Link href={`/research/compare?t=${selected.join(",")}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-[12.5px] font-medium text-accent-ink">
            <IconCompare size={15} /> Comparar
          </Link>
        </div>
      )}
      <QuickView ticker={quick} onClose={() => setQuick(null)} benchmark={benchmark} watched={quick ? watch.has(quick) : false} onWatch={flipWatch} held={quick ? heldSet.has(quick) : false} />
    </div>
  );
}

function DesktopTable({
  data, ctx, cols, sort, onSort, selected, toggleSel, watch, flipWatch, onOpen,
}: {
  data: RadarRow[]; ctx: ColCtx; cols: (typeof COLS)[string][]; sort: { key: SortKey; dir: "asc" | "desc" }; onSort: (k?: SortKey) => void;
  selected: string[]; toggleSel: (t: string) => void; watch: Set<string>; flipWatch: (t: string) => void; onOpen: (t: string) => void;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: data.length, getScrollElement: () => parent.current, estimateSize: () => ROW_H, overscan: 12 });
  const template = `34px ${cols.map((c) => (c.id === "why" || c.id === "name" ? `minmax(${c.width}px, 1fr)` : `${c.width}px`)).join(" ")} 40px`;
  const minW = 74 + cols.reduce((s, c) => s + c.width, 0);
  if (!data.length) {
    return <div className="rounded-[var(--radius-panel)] border border-dashed border-line-2 px-5 py-10 text-center text-[13px] text-ink-2">Ningún activo cumple los filtros actuales.</div>;
  }
  return (
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
      <div ref={parent} className="h-[calc(100dvh-300px)] min-h-[440px] overflow-auto" role="table" aria-label="Momentum Radar" aria-rowcount={data.length}>
        <div style={{ minWidth: minW }}>
          <div role="row" className="sticky top-0 z-10 grid h-9 items-center border-b border-line bg-surface/95 text-[11px] font-medium uppercase tracking-[0.05em] text-ink-3 backdrop-blur" style={{ gridTemplateColumns: template }}>
            <span />
            {cols.map((c) => (
              <button
                key={c.id}
                role="columnheader"
                title={c.title}
                aria-sort={sort.key === c.sort ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                onClick={() => onSort(c.sort)}
                className={cx("flex h-full items-center gap-1 px-2", c.align === "right" ? "justify-end" : "justify-start", c.sort ? "hover:text-ink-2" : "cursor-default", sort.key === c.sort && "text-ink")}
              >
                {c.label}
                {sort.key === c.sort && <span className="text-accent">{sort.dir === "asc" ? "↑" : "↓"}</span>}
              </button>
            ))}
            <span />
          </div>
          <div style={{ height: v.getTotalSize(), position: "relative" }}>
            {v.getVirtualItems().map((vi) => {
              const r = data[vi.index];
              const sel = selected.includes(r.t);
              return (
                <div
                  key={r.t}
                  role="row"
                  onClick={() => onOpen(r.t)}
                  className={cx("absolute left-0 right-0 grid cursor-pointer items-center border-b border-line text-[13px] transition-colors hover:bg-surface-2", sel && "bg-accent-soft/40")}
                  style={{ height: ROW_H, transform: `translateY(${vi.start}px)`, gridTemplateColumns: template }}
                >
                  <span className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Comparar ${r.t}`} checked={sel} onChange={() => toggleSel(r.t)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
                  </span>
                  {cols.map((c) => (
                    <span key={c.id} role="cell" className={cx("min-w-0 px-2", c.align === "right" ? "text-right" : "", c.sticky && "")}>
                      {c.render(r, ctx)}
                    </span>
                  ))}
                  <span className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                    <button aria-label={watch.has(r.t) ? `Quitar ${r.t} de la watchlist` : `Añadir ${r.t} a la watchlist`} onClick={() => flipWatch(r.t)} className={cx("rounded p-1", watch.has(r.t) ? "text-accent" : "text-ink-3 hover:text-ink-2")}>
                      {watch.has(r.t) ? <IconWatchFilled size={15} /> : <IconWatch size={15} />}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileList({ data, horizon, watch, onOpen }: { data: RadarRow[]; horizon: Horizon; watch: Set<string>; onOpen: (t: string) => void }) {
  const [n, setN] = useState(60);
  if (!data.length) return <p className="py-8 text-center text-[13px] text-ink-2">Ningún activo cumple los filtros actuales.</p>;
  return (
    <div className="flex flex-col divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
      {data.slice(0, n).map((r) => (
        <button key={r.t} onClick={() => onOpen(r.t)} className="flex items-center gap-3 px-3.5 py-3 text-left active:bg-surface-2">
          <span className="num w-7 shrink-0 text-right text-[12px] text-ink-3">{r.rank}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center gap-2">
              <Ticker t={r.t} />
              {watch.has(r.t) && <IconWatchFilled size={12} className="text-accent" />}
              <StatePill state={r.st} short className="ml-auto" />
            </span>
            <span className="flex items-center gap-2">
              <span className="truncate text-[12px] text-ink-3">{r.n}</span>
            </span>
          </span>
          <span className="flex w-[78px] shrink-0 flex-col items-end gap-1.5">
            <span className="num text-[13px] text-ink">{score(r.ov)}</span>
            <ScoreBar v={r.ov} width="w-14" />
            <Delta v={r[horizon]} className="text-[11.5px]" />
          </span>
        </button>
      ))}
      {n < data.length && (
        <button onClick={() => setN(n + 60)} className="py-3 text-[13px] text-accent">
          Mostrar más ({data.length - n})
        </button>
      )}
    </div>
  );
}

function FilterPopover({ filters, setFilters, sectors, count }: { filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>; sectors: string[]; count: number }) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className={cx("inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-2.5 text-[12.5px]", count ? "border-accent-line bg-accent-soft text-ink" : "border-line-2 text-ink-2 hover:bg-surface-2")}>
          <IconFilter size={15} /> Filtros{count ? ` · ${count}` : ""} <IconChevronDown size={13} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-50 w-[min(92vw,560px)] rounded-[12px] border border-line-2 bg-surface-2 p-4 shadow-[0_12px_40px_rgb(0_0_0/0.5)]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              {filters.cls === "stock" && (
                <label className="flex flex-col gap-1.5">
                  <span className="t-label">Capitalización mínima</span>
                  <Select value={filters.minMcap} onChange={(e) => set("minMcap", Number(e.target.value))}>
                    <option value={0}>Universo completo (≥ 2.000 M$)</option>
                    <option value={10e9}>≥ 10.000 M$</option>
                    <option value={50e9}>≥ 50.000 M$</option>
                    <option value={200e9}>≥ 200.000 M$</option>
                  </Select>
                </label>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="t-label">Liquidez mínima (vol. $ medio 63d)</span>
                <Select value={filters.minAdv} onChange={(e) => set("minAdv", Number(e.target.value))}>
                  <option value={0}>Universo completo</option>
                  <option value={50e6}>≥ 50 M$/día</option>
                  <option value={100e6}>≥ 100 M$/día</option>
                  <option value={500e6}>≥ 500 M$/día</option>
                </Select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="t-label">Riesgo máximo</span>
                <Select value={filters.maxRisk} onChange={(e) => set("maxRisk", Number(e.target.value))}>
                  <option value={100}>Sin límite</option>
                  <option value={80}>Risk ≤ p80</option>
                  <option value={60}>Risk ≤ p60</option>
                  <option value={40}>Risk ≤ p40</option>
                </Select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="t-label">Volatilidad 63d máxima</span>
                <Select value={filters.maxVol} onChange={(e) => set("maxVol", Number(e.target.value))}>
                  <option value={10}>Sin límite</option>
                  <option value={0.6}>≤ 60 %</option>
                  <option value={0.4}>≤ 40 %</option>
                  <option value={0.25}>≤ 25 %</option>
                </Select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="t-label">Mercado</span>
                <Select value={filters.exchange} onChange={(e) => set("exchange", e.target.value)}>
                  <option value="">Todos</option>
                  <option value="XNYS">NYSE</option>
                  <option value="XNAS">Nasdaq</option>
                  <option value="XASE">NYSE American</option>
                  <option value="ARCX">NYSE Arca</option>
                  <option value="BATS">Cboe BZX</option>
                </Select>
              </label>
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 text-[13px] text-ink-2">
                  <input type="checkbox" checked={filters.onlyHeld} onChange={(e) => set("onlyHeld", e.target.checked)} className="accent-[var(--accent)]" /> Solo en mi cartera
                </label>
                <label className="flex items-center gap-2 text-[13px] text-ink-2">
                  <input type="checkbox" checked={filters.onlyWatch} onChange={(e) => set("onlyWatch", e.target.checked)} className="accent-[var(--accent)]" /> Solo en watchlist
                </label>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <span className="t-label">Estado</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {STATES.map((s) => (
                    <button key={s} onClick={() => set("states", toggle(filters.states, s))} className={cx("rounded-full", filters.states.includes(s) ? "" : "opacity-55 hover:opacity-90")} title={STATE_LABELS[s]}>
                      <StatePill state={s} short />
                    </button>
                  ))}
                </div>
              </div>
              {filters.cls === "stock" && (
                <div>
                  <span className="t-label">Sector (aprox. SIC)</span>
                  <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-auto pr-1">
                    {sectors.map((s) => (
                      <label key={s} className="flex items-center gap-2 text-[13px] text-ink-2">
                        <input type="checkbox" checked={filters.sectors.includes(s)} onChange={() => set("sectors", toggle(filters.sectors, s))} className="accent-[var(--accent)]" /> {s}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex justify-between border-t border-line pt-3">
            <Button size="sm" variant="ghost" onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, cls: f.cls, search: f.search }))}>
              Restablecer
            </Button>
            <Popover.Close asChild>
              <Button size="sm" variant="primary">
                Aplicar
              </Button>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

