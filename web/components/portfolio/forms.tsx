"use client";

import { Dialog } from "radix-ui";
import { useActionState, useEffect, useState, useTransition } from "react";

import { addManualPrice, addTransaction, deleteInstrument, deleteTransaction, saveInstrument, saveSettings, type ActionResult } from "@/app/(app)/portfolio/actions";
import { IconClose, IconPlus, IconTrash } from "@/components/ui/icons";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { contributionPlan } from "@/lib/portfolio/engine";
import { BUCKET_LABELS, TX_LABELS, type Instrument, type Settings, type TxType } from "@/lib/portfolio/types";
import { money } from "@/lib/format";

function Sheet({ title, trigger, children, open, setOpen }: { title: string; trigger: React.ReactNode; children: React.ReactNode; open: boolean; setOpen: (o: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-[16px] border border-line-2 bg-canvas-2 p-5 shadow-2xl focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[8vh] sm:w-[560px] sm:-translate-x-1/2 sm:rounded-[14px]">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-[16px] font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="rounded p-1 text-ink-3 hover:text-ink" aria-label="Cerrar">
              <IconClose size={17} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Result({ state }: { state: ActionResult }) {
  if (!state) return null;
  return <p className={state.ok ? "text-[13px] text-pos" : "text-[13px] text-neg"}>{state.message}</p>;
}

const TYPES_WITH_INSTRUMENT: TxType[] = ["buy", "sell", "dividend", "split"];

export function TransactionForm({ instruments }: { instruments: Instrument[] }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TxType>("buy");
  const [currency, setCurrency] = useState("EUR");
  const [state, action, pending] = useActionState<ActionResult, FormData>(addTransaction, null);
  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => setOpen(false), 700);
      return () => clearTimeout(t);
    }
  }, [state]);
  const needsIns = TYPES_WITH_INSTRUMENT.includes(type);
  const trade = type === "buy" || type === "sell";
  return (
    <Sheet
      title="Registrar operación"
      open={open}
      setOpen={setOpen}
      trigger={
        <Button variant="primary">
          <IconPlus size={16} /> Operación
        </Button>
      }
    >
      <form action={action} className="grid grid-cols-2 gap-3.5">
        <Field label="Tipo">
          <Select name="type" value={type} onChange={(e) => setType(e.target.value as TxType)}>
            {(Object.keys(TX_LABELS) as TxType[]).map((t) => (
              <option key={t} value={t}>
                {TX_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha">
          <Input type="date" name="trade_date" required defaultValue={new Date().toISOString().slice(0, 10)} max={new Date().toISOString().slice(0, 10)} />
        </Field>
        {needsIns && (
          <Field label="Instrumento" className="col-span-2" hint={instruments.length ? undefined : "Primero añade un instrumento."}>
            <Select name="instrument_id" required>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} {i.isin ? `· ${i.isin}` : i.market_ticker ? `· ${i.market_ticker}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {trade && (
          <>
            <Field label="Unidades">
              <Input name="quantity" inputMode="decimal" required placeholder="0,000000" />
            </Field>
            <Field label="Precio por unidad">
              <Input name="price" inputMode="decimal" required placeholder="0,00" />
            </Field>
            <Field label="Comisión">
              <Input name="fees" inputMode="decimal" placeholder="1,00" />
            </Field>
            {type === "sell" && (
              <Field label="Impuestos retenidos">
                <Input name="taxes" inputMode="decimal" placeholder="0,00" />
              </Field>
            )}
          </>
        )}
        {!trade && type !== "split" && (
          <Field label={type === "dividend" ? "Importe neto cobrado" : "Importe"} className={type === "dividend" ? "" : "col-span-2"}>
            <Input name="amount" inputMode="decimal" required placeholder="0,00" />
          </Field>
        )}
        {type === "dividend" && (
          <Field label="Retención (informativo)">
            <Input name="taxes" inputMode="decimal" placeholder="0,00" />
          </Field>
        )}
        {type === "split" && (
          <Field label="Ratio (nuevas por cada antigua)" className="col-span-2" hint="Split 4:1 → 4 · contrasplit 1:10 → 0,1">
            <Input name="split_ratio" inputMode="decimal" required />
          </Field>
        )}
        {type !== "split" && (
          <Field label="Divisa">
            <Select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {["EUR", "USD", "GBP", "CHF"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        )}
        {currency !== "EUR" && type !== "split" && (
          <Field label="Tipo de cambio (EUR por 1 unidad)" hint="El aplicado por tu bróker en la operación">
            <Input name="fx_rate" inputMode="decimal" required placeholder="0,92" />
          </Field>
        )}
        <Field label="Nota" className="col-span-2">
          <Input name="note" maxLength={500} placeholder="Opcional" />
        </Field>
        <div className="col-span-2 flex items-center justify-between gap-3 pt-1">
          <Result state={state} />
          <Button variant="primary" type="submit" disabled={pending} className="ml-auto">
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
        <p className="col-span-2 t-meta">
          Aportaciones: registra cada ingreso de dinero en el bróker como «Aportación» para que TWR y TIR sean exactas. Las operaciones se registran manualmente: WarrenIA no se conecta a tu bróker.
        </p>
      </form>
    </Sheet>
  );
}

export function InstrumentForm({ instrument, trigger }: { instrument?: Instrument; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(instrument?.price_source ?? "eodhd");
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveInstrument, null);
  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => setOpen(false), 600);
      return () => clearTimeout(t);
    }
  }, [state]);
  return (
    <Sheet
      title={instrument ? "Editar instrumento" : "Nuevo instrumento"}
      open={open}
      setOpen={setOpen}
      trigger={
        trigger ?? (
          <Button>
            <IconPlus size={16} /> Instrumento
          </Button>
        )
      }
    >
      <form action={action} className="grid grid-cols-2 gap-3.5">
        {instrument && <input type="hidden" name="id" value={instrument.id} />}
        <Field label="Nombre" className="col-span-2">
          <Input name="name" required defaultValue={instrument?.name} placeholder="p. ej. iShares Core MSCI World UCITS ETF" />
        </Field>
        <Field label="ISIN">
          <Input name="isin" defaultValue={instrument?.isin ?? ""} placeholder="IE00B4L5Y983" className="font-mono uppercase" />
        </Field>
        <Field label="Tipo">
          <Select name="kind" defaultValue={instrument?.kind ?? "etf"}>
            <option value="etf">ETF</option>
            <option value="etc">ETC (p. ej. oro)</option>
            <option value="stock">Acción</option>
            <option value="fund">Fondo</option>
            <option value="other">Otro</option>
          </Select>
        </Field>
        <Field label="Bloque de la estrategia">
          <Select name="bucket" defaultValue={instrument?.bucket ?? "core"}>
            {(["core", "gold", "momentum", "other"] as const).map((b) => (
              <option key={b} value={b}>
                {BUCKET_LABELS[b]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fuente de precio">
          <Select name="price_source" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="eodhd">EODHD (ETF/ETC en Xetra, EUR)</option>
            <option value="us_market">Mercado EE. UU. (motor, USD)</option>
            <option value="manual">Manual</option>
          </Select>
        </Field>
        {source === "eodhd" && (
          <Field label="Símbolo EODHD" hint="Formato TICKER.BOLSA, p. ej. EUNL.XETRA" className="col-span-2">
            <Input name="eodhd_symbol" defaultValue={instrument?.eodhd_symbol ?? ""} className="font-mono uppercase" />
          </Field>
        )}
        {source === "us_market" && (
          <Field label="Ticker EE. UU." hint="Se valora con el cierre en USD convertido con el tipo del BCE" className="col-span-2">
            <Input name="market_ticker" defaultValue={instrument?.market_ticker ?? ""} className="font-mono uppercase" />
          </Field>
        )}
        {source !== "us_market" && (
          <Field label="Divisa de cotización">
            <Select name="currency" defaultValue={instrument?.currency ?? "EUR"}>
              {["EUR", "USD", "GBP", "CHF"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        )}
        {source === "us_market" && <input type="hidden" name="currency" value="USD" />}
        <Field label="Sector (acciones)">
          <Input name="sector" defaultValue={instrument?.sector ?? ""} placeholder="Technology" />
        </Field>
        <div className="col-span-2 flex items-center justify-between gap-3 pt-1">
          <Result state={state} />
          <Button variant="primary" type="submit" disabled={pending} className="ml-auto">
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

export function DeleteButton({ id, kind, label }: { id: string; kind: "tx" | "instrument"; label: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {err && <span className="text-[12px] text-neg">{err}</span>}
      <button
        disabled={pending}
        aria-label={label}
        title={label}
        onClick={() => {
          if (!confirm(`${label}?`)) return;
          setErr(null);
          start(() => (kind === "tx" ? deleteTransaction(id) : deleteInstrument(id)).catch((e: Error) => setErr(e.message)));
        }}
        className="rounded p-1 text-ink-3 hover:bg-neg-soft hover:text-neg disabled:opacity-40"
      >
        <IconTrash size={15} />
      </button>
    </span>
  );
}

export function ManualPriceForm({ instruments }: { instruments: Instrument[] }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(addManualPrice, null);
  const manual = instruments.filter((i) => i.price_source === "manual");
  if (!manual.length) return null;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Field label="Instrumento (precio manual)">
        <Select name="instrument_id">
          {manual.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Fecha">
        <Input type="date" name="price_date" required defaultValue={new Date().toISOString().slice(0, 10)} />
      </Field>
      <Field label="Precio">
        <Input name="price" inputMode="decimal" required className="w-28" />
      </Field>
      <Button type="submit" disabled={pending}>
        Guardar precio
      </Button>
      <Result state={state} />
    </form>
  );
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveSettings, null);
  return (
    <form action={action} className="grid max-w-xl grid-cols-2 gap-3.5 sm:grid-cols-3">
      <Field label="Núcleo global %">
        <Input name="core" inputMode="decimal" defaultValue={Math.round(settings.targets.core * 1000) / 10} />
      </Field>
      <Field label="Oro %">
        <Input name="gold" inputMode="decimal" defaultValue={Math.round(settings.targets.gold * 1000) / 10} />
      </Field>
      <Field label="Acciones/momentum %">
        <Input name="momentum" inputMode="decimal" defaultValue={Math.round(settings.targets.momentum * 1000) / 10} />
      </Field>
      <Field label="Banda absoluta (pp)" hint="Desviación tolerada">
        <Input name="band_abs" inputMode="decimal" defaultValue={Math.round(settings.band_abs * 1000) / 10} />
      </Field>
      <Field label="Banda relativa (%)" hint="Sobre el peso objetivo">
        <Input name="band_rel" inputMode="decimal" defaultValue={Math.round(settings.band_rel * 1000) / 10} />
      </Field>
      <Field label="Aportación mensual (€)">
        <Input name="monthly_contribution" inputMode="decimal" defaultValue={settings.monthly_contribution} />
      </Field>
      <div className="col-span-2 flex items-center gap-3 sm:col-span-3">
        <Button type="submit" variant="primary" disabled={pending}>
          Guardar
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function ContributionPlanner({ values, other, settings }: { values: Record<"core" | "gold" | "momentum", number>; other: number; settings: Settings }) {
  const [amount, setAmount] = useState(String(settings.monthly_contribution));
  const a = Number(amount.replace(",", ".")) || 0;
  const plan = contributionPlan(values, other, settings.targets, a);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-3">
        <span className="t-label">Próxima aportación</span>
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="h-8 w-28 text-right num" aria-label="Importe de la aportación" />
        <span className="text-[13px] text-ink-3">€</span>
      </label>
      <div className="grid grid-cols-3 gap-2">
        {(["core", "gold", "momentum"] as const).map((k) => (
          <div key={k} className="rounded-[8px] border border-line bg-canvas-2 px-3 py-2">
            <div className="t-meta truncate">{BUCKET_LABELS[k]}</div>
            <div className="num text-[15px] font-semibold">{money(plan[k], "EUR", 0)}</div>
          </div>
        ))}
      </div>
      <p className="t-meta">
        Reparto que acerca la cartera a los pesos objetivo usando solo la nueva aportación (sin ventas). Es una ayuda de cálculo, no una orden: la ejecución es siempre manual.
      </p>
    </div>
  );
}
