import Link from "next/link";

import { ImportFlow } from "@/components/portfolio/import-flow";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/primitives";

export const metadata = { title: "Import transactions" };

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import transactions (CSV)" sub={<><Link href="/portfolio" className="hover:text-ink">Portfolio</Link> / preview and checks before anything is saved</>} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <ImportFlow />
        </Panel>
        <Panel title="Accepted format">
          <div className="flex flex-col gap-3 text-[13px] text-ink-2">
            <p>Required columns: <code className="font-mono text-ink">date</code> and <code className="font-mono text-ink">type</code>. Optional: isin, ticker, name, quantity, price, amount, fees, taxes, currency, fx_rate, ratio, note (Spanish and German headers also work).</p>
            <p>Types: buy, sell, deposit, withdrawal, dividend, interest, fee, tax, split.</p>
            <p>Separator &ldquo;;&rdquo; with decimal commas, or &ldquo;,&rdquo; with decimal points. Dates YYYY-MM-DD or DD/MM/YYYY.</p>
            <p>Repeated rows are detected (re-importing does not duplicate them). Unknown instruments are created with manual pricing; review them afterwards.</p>
            <p className="t-meta">
              Trade Republic has no public API: no credentials are ever asked for. If you export your activity, map the columns to this format (template in docs/import-template.csv).
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
