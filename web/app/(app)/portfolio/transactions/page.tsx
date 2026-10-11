import Link from "next/link";

import { DeleteButton, InstrumentForm, ManualPriceForm, TransactionForm } from "@/components/portfolio/forms";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, EmptyState, Panel } from "@/components/ui/primitives";
import { dateLabel, money, num } from "@/lib/format";
import { BUCKET_LABELS, TX_LABELS } from "@/lib/portfolio/types";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Operaciones" };

export default async function TransactionsPage() {
  const store = await requireStore();
  const [instruments, txs] = await Promise.all([store.instruments(), store.transactions()]);
  const byId = new Map(instruments.map((i) => [i.id, i]));
  return (
    <>
      <PageHeader
        title="Operaciones e instrumentos"
        sub={<><Link href="/portfolio" className="hover:text-ink">Portfolio</Link> / registro manual · las operaciones nunca se envían a ningún bróker</>}
        actions={
          <>
            <InstrumentForm />
            <TransactionForm instruments={instruments} />
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <Panel title="Instrumentos" meta="Cómo se valora cada uno" pad={false}>
          {instruments.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState title="Sin instrumentos">Añade el ETF del núcleo, el oro y las acciones que compres.</EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead>
                  <tr className="border-y border-line text-left text-[11px] uppercase tracking-[0.05em] text-ink-3">
                    <th className="px-4 py-2 font-medium md:px-5">Nombre</th>
                    <th className="px-3 py-2 font-medium">ISIN / ticker</th>
                    <th className="px-3 py-2 font-medium">Bloque</th>
                    <th className="px-3 py-2 font-medium">Precio</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {instruments.map((i) => (
                    <tr key={i.id} className="border-b border-line">
                      <td className="px-4 py-2.5 text-ink md:px-5">{i.name}</td>
                      <td className="px-3 py-2.5 font-mono text-[12.5px] text-ink-2">{i.isin ?? "—"} {i.market_ticker && <span className="text-ink-3">· {i.market_ticker}</span>}</td>
                      <td className="px-3 py-2.5 text-ink-2">{BUCKET_LABELS[i.bucket]}</td>
                      <td className="px-3 py-2.5 text-ink-2">
                        {i.price_source === "eodhd" ? `EODHD · ${i.eodhd_symbol}` : i.price_source === "us_market" ? "Motor EE. UU. (USD→EUR BCE)" : <Badge tone="warn">manual</Badge>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="inline-flex items-center gap-1">
                          <InstrumentForm instrument={i} trigger={<button className="tap rounded px-2 py-1 text-[12.5px] text-ink-3 hover:bg-surface-2 hover:text-ink">Editar</button>} />
                          <DeleteButton id={i.id} kind="instrument" label={`Borrar ${i.name}`} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 py-4 md:px-5">
            <ManualPriceForm instruments={instruments} />
          </div>
        </Panel>

        <Panel title={`Operaciones (${txs.length})`} pad={false}>
          {txs.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState title="Sin operaciones">Registra tu primera aportación y compra, o importa un CSV.</EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[13px]">
                <thead>
                  <tr className="border-y border-line text-right text-[11px] uppercase tracking-[0.05em] text-ink-3">
                    <th className="px-4 py-2 text-left font-medium md:px-5">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium">Instrumento</th>
                    <th className="px-3 py-2 font-medium">Unidades</th>
                    <th className="px-3 py-2 font-medium">Precio</th>
                    <th className="px-3 py-2 font-medium">Importe</th>
                    <th className="px-3 py-2 font-medium">Comisión</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {[...txs].reverse().map((t) => (
                    <tr key={t.id} className="border-b border-line">
                      <td className="num px-4 py-2 text-ink-2 md:px-5">{dateLabel(t.trade_date)}</td>
                      <td className="px-3 py-2">{TX_LABELS[t.type]} {t.source === "csv" && <span className="t-meta">· csv</span>}</td>
                      <td className="px-3 py-2 text-ink-2">{t.instrument_id ? byId.get(t.instrument_id)?.name : "—"}</td>
                      <td className="num px-3 py-2 text-right">{t.type === "split" ? `×${num(t.split_ratio, 4)}` : t.quantity !== null ? num(t.quantity, 4) : ""}</td>
                      <td className="num px-3 py-2 text-right">{t.price !== null ? `${num(t.price)} ${t.currency}` : ""}</td>
                      <td className="num px-3 py-2 text-right">
                        {t.amount !== null ? money(t.amount, t.currency) : t.quantity !== null && t.price !== null ? money(t.quantity * t.price, t.currency) : ""}
                      </td>
                      <td className="num px-3 py-2 text-right text-ink-3">{t.fees ? money(t.fees, t.currency) : ""}</td>
                      <td className="px-3 py-2 text-right">
                        <DeleteButton id={t.id} kind="tx" label="Borrar operación" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
