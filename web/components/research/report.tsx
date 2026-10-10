import { cx, Panel } from "@/components/ui/primitives";
import { dateLabel, pct } from "@/lib/format";
import type { Report, RuleCondition } from "@/lib/market/types";
import { STATE_LABELS, type StateKey } from "@/lib/market/types";

export function ReportSections({ report, relevance }: { report: Report; relevance: string[] }) {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Thesis" meta="Qué hace el precio y por qué destaca en el ranking">
        <ul className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-ink-2">
          {report.thesis.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </Panel>
      <Panel title="Evidence" meta="Datos numéricos del cálculo de esta ejecución" pad={false}>
        <dl className="divide-y divide-line">
          {report.evidence.map((e) => (
            <div key={e.label} className="grid grid-cols-1 gap-1 px-4 py-2.5 sm:grid-cols-[1fr_auto] md:px-5">
              <dt className="text-[13px] text-ink-2">{e.label}</dt>
              <dd className="num text-[13px] text-ink sm:text-right">
                {e.value}
                {e.context && <span className="block text-[12px] text-ink-3">{e.context}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Risks" meta="Señales de deterioro, sobreextensión y volatilidad">
          <ul className="flex list-disc flex-col gap-2 pl-4 text-[13px] leading-relaxed text-ink-2 marker:text-ink-3">
            {report.risks.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="Invalidation" meta="Condiciones observables que debilitarían la tesis">
          <ul className="flex list-disc flex-col gap-2 pl-4 text-[13px] leading-relaxed text-ink-2 marker:text-ink-3">
            {report.invalidation.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          <p className="t-meta mt-3">No se proponen precios objetivo ni niveles de stop: la metodología no define ninguno.</p>
        </Panel>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Portfolio relevance">
          <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-ink-2">
            {relevance.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="Data quality">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            <dt className="text-ink-3">Fuente</dt>
            <dd className="text-ink-2">{report.data_quality.source}</dd>
            <dt className="text-ink-3">Datos al</dt>
            <dd className="text-ink-2">Cierre {dateLabel(report.data_quality.asof)} (EOD)</dd>
            <dt className="text-ink-3">Historia</dt>
            <dd className="num text-ink-2">{report.data_quality.history_sessions} sesiones</dd>
            <dt className="text-ink-3">Huecos</dt>
            <dd className="num text-ink-2">{pct(report.data_quality.missing_frac, 1, false)} de sesiones sin dato (último año)</dd>
          </dl>
          {report.data_quality.notes.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-[12.5px] text-ink-3">
              {report.data_quality.notes.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <p className="t-meta">{report.disclaimer}</p>
    </div>
  );
}

function fmtVal(c: RuleCondition) {
  if (typeof c.value === "boolean") return c.value ? "sí" : "no";
  if (c.value === null) return "n/d";
  const v = c.value;
  return Math.abs(v) < 5 && !Number.isInteger(v) ? v.toFixed(2).replace(".", ",") : String(Math.round(v * 10) / 10).replace(".", ",");
}

export function RuleTrace({ trace, state }: { trace: Record<string, RuleCondition[]>; state: StateKey }) {
  const order: StateKey[] = ["speculative", "extended", "weakening", "breakout", "strong", "improving"];
  return (
    <div className="flex flex-col gap-3">
      {order.map((k) => {
        const conds = trace[k] ?? [];
        const fired = k === state;
        return (
          <details key={k} open={fired} className={cx("rounded-[8px] border px-3 py-2", fired ? "border-accent-line bg-accent-soft/40" : "border-line")}>
            <summary className="cursor-pointer text-[12.5px] text-ink-2 marker:text-ink-3">
              <span className={fired ? "font-medium text-ink" : ""}>{STATE_LABELS[k]}</span>
              <span className="ml-2 text-ink-3">{conds.filter((c) => c.pass).length}/{conds.length} condiciones</span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {conds.map((c, i) => (
                <li key={i} className="flex items-start justify-between gap-3 text-[12px]">
                  <span className={c.pass ? "text-ink-2" : "text-ink-3"}>
                    <span className={c.pass ? "text-pos" : "text-ink-3"}>{c.pass ? "✓" : "·"}</span> {c.text}
                  </span>
                  <span className="num shrink-0 text-ink-3">
                    {fmtVal(c)} {typeof c.threshold === "number" ? `${c.op} ${c.threshold}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
      <p className="t-meta">Precedencia: Speculative › Extended › Weakening › Breakout › Strong › Improving. Umbrales en config/momentum.yaml.</p>
    </div>
  );
}
