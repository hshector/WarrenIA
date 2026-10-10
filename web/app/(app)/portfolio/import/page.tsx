import Link from "next/link";

import { ImportFlow } from "@/components/portfolio/import-flow";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/primitives";

export const metadata = { title: "Importar operaciones" };

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Importar operaciones (CSV)" sub={<><Link href="/portfolio" className="hover:text-ink">Portfolio</Link> / vista previa y validación antes de guardar nada</>} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <ImportFlow />
        </Panel>
        <Panel title="Formato admitido">
          <div className="flex flex-col gap-3 text-[13px] text-ink-2">
            <p>Columnas obligatorias: <code className="font-mono text-ink">fecha</code> y <code className="font-mono text-ink">tipo</code>. Opcionales: isin, ticker, nombre, cantidad, precio, importe, comision, impuestos, divisa, tipo_cambio, ratio, nota (también en inglés).</p>
            <p>Tipos: compra, venta, aportación, retirada, dividendo, intereses, comisión, impuesto, split.</p>
            <p>Separador «;» con decimales con coma, o «,» con decimales con punto. Fechas AAAA-MM-DD o DD/MM/AAAA.</p>
            <p>Las filas repetidas se detectan (no se duplican al reimportar). Los instrumentos desconocidos se crean con valoración manual; revísalos después.</p>
            <p className="t-meta">
              Trade Republic no ofrece una API pública: no se piden credenciales. Si exportas tus movimientos, adapta las columnas a este formato (plantilla en docs/import-template.csv).
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
