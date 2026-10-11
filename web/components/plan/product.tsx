import { cx } from "@/components/ui/primitives";
import { pct } from "@/lib/format";
import type { Product } from "@/lib/plan/catalog";

/** One product: name, ISIN (what you search in the broker), fee and trade-offs. */
export function ProductCard({ p, compact = false }: { p: Product; compact?: boolean }) {
  return (
    <div className={cx("rounded-[18px] px-4 py-4", p.recommended ? "bg-accent-soft ring-1 ring-accent/30" : "bg-surface-2")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {p.recommended && <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-accent-2">Recomendado</p>}
          <p className="text-[15.5px] font-semibold leading-snug">{p.name}</p>
          <p className="num mt-0.5 select-all text-[13.5px] text-ink-2">ISIN {p.isin}</p>
        </div>
        <span className="num shrink-0 rounded-full bg-surface px-3 py-1 text-[13px] font-semibold">{p.ter === 0 ? "Sin comisión de gestión" : `${pct(p.ter, 2, false)} al año`}</span>
      </div>
      <p className="mt-2 text-[14px] text-ink-2">
        {p.index} · {p.coverage} · {p.distribution} · domicilio {p.domicile}
      </p>
      {!compact && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ul className="flex flex-col gap-1.5 text-[14px]">
            {p.pros.map((x) => (
              <li key={x} className="flex gap-2">
                <span className="text-pos">+</span>
                <span>{x}</span>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-1.5 text-[14px]">
            {p.cons.map((x) => (
              <li key={x} className="flex gap-2">
                <span className="text-neg">−</span>
                <span>{x}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
