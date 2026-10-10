"use client";

import { useState, useTransition } from "react";

import { commitImport, previewImport, type ImportPreview } from "@/app/(app)/portfolio/actions";
import { Badge, Button, Callout } from "@/components/ui/primitives";
import { TX_LABELS } from "@/lib/portfolio/types";
import { num } from "@/lib/format";

export function ImportFlow() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 2_000_000) {
      setResult({ ok: false, message: "Fichero demasiado grande (máx. 2 MB)" });
      return;
    }
    setText(await f.text());
    setPreview(null);
    setResult(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-9 cursor-pointer items-center rounded-[8px] border border-line-2 bg-surface-2 px-3.5 text-[13.5px] hover:bg-surface-3">
          Elegir fichero CSV
          <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <span className="t-meta">o pega el contenido abajo</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        rows={7}
        spellCheck={false}
        placeholder={"fecha;tipo;isin;ticker;nombre;cantidad;precio;importe;comision;divisa;tipo_cambio\n02/01/2026;aportación;;;;;;450;;EUR;"}
        className="w-full rounded-[8px] border border-line-2 bg-canvas-2 p-3 font-mono text-[12px] text-ink outline-none focus:border-accent-line"
      />
      <div className="flex gap-2">
        <Button disabled={!text.trim() || pending} onClick={() => start(async () => setPreview(await previewImport(text)))}>
          Vista previa y validación
        </Button>
        {preview && preview.valid > 0 && (
          <Button variant="primary" disabled={pending} onClick={() => start(async () => setResult(await commitImport(text)))}>
            Importar {preview.valid} filas válidas
          </Button>
        )}
      </div>
      {result && <Callout tone={result.ok ? "accent" : "neg"}>{result.message}</Callout>}
      {preview && preview.headerErrors.length > 0 && <Callout tone="neg" title="Cabecera no válida">{preview.headerErrors.join(" · ")}</Callout>}
      {preview && preview.rows.length > 0 && (
        <div className="overflow-x-auto rounded-[10px] border border-line">
          <p className="px-3 py-2 text-[12.5px] text-ink-2">
            {preview.valid} válidas · {preview.invalid} con errores (no se importarán)
          </p>
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="border-y border-line text-left text-[11px] uppercase tracking-[0.05em] text-ink-3">
                <th className="px-3 py-1.5 font-medium">Línea</th>
                <th className="px-3 py-1.5 font-medium">Fecha</th>
                <th className="px-3 py-1.5 font-medium">Tipo</th>
                <th className="px-3 py-1.5 font-medium">Instrumento</th>
                <th className="px-3 py-1.5 text-right font-medium">Cant.</th>
                <th className="px-3 py-1.5 text-right font-medium">Precio / importe</th>
                <th className="px-3 py-1.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.line} className="border-b border-line">
                  <td className="num px-3 py-1.5 text-ink-3">{r.line}</td>
                  <td className="num px-3 py-1.5">{r.tx?.trade_date ?? "—"}</td>
                  <td className="px-3 py-1.5">{r.tx ? TX_LABELS[r.tx.type] : "—"}</td>
                  <td className="px-3 py-1.5 text-ink-2">
                    {r.match ?? r.name ?? r.isin ?? r.ticker ?? "—"} {r.willCreate && <Badge tone="info">nuevo</Badge>}
                  </td>
                  <td className="num px-3 py-1.5 text-right">{r.tx?.quantity !== null && r.tx?.quantity !== undefined ? num(r.tx.quantity, 4) : ""}</td>
                  <td className="num px-3 py-1.5 text-right">{r.tx ? num(r.tx.price ?? r.tx.amount ?? null) : ""}</td>
                  <td className="px-3 py-1.5">{r.ok ? <span className="text-pos">OK</span> : <span className="text-neg">{r.errors.join(" · ")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
