"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { addManualPrice, addTransaction, deleteInstrument, deleteTransaction, saveInstrument, saveSettings, type ActionResult } from "@/app/(app)/portfolio/actions";
import { IconPlus, IconTrash } from "@/components/ui/icons";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { ConfirmDialog, Sheet } from "@/components/ui/sheet";
import { contributionPlan } from "@/lib/portfolio/engine";
import { BUCKET_LABELS, TX_LABELS, type Instrument, type Settings, type TxType } from "@/lib/portfolio/types";
import { money } from "@/lib/format";

/** Errors stay next to the form; success is a toast (the sheet closes). */
function Result({ state }: { state: ActionResult }) {
  if (!state || state.ok) return null;
  return <p className="text-[14px] text-neg">{state.message}</p>;
}

function useSuccessToast(state: ActionResult, then?: () => void) {
  useEffect(() => {
    if (!state?.ok) return;
    toast.success(state.message);
    then?.();
    // `then` is a fresh closure each render; the effect must run once per result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

const TYPES_WITH_INSTRUMENT: TxType[] = ["buy", "sell", "dividend", "split"];

export function TransactionForm({ instruments, defaultOpen = false }: { instruments: Instrument[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [type, setType] = useState<TxType>("buy");
  const [currency, setCurrency] = useState("EUR");
  const [state, action, pending] = useActionState<ActionResult, FormData>(addTransaction, null);
  useSuccessToast(state, () => setOpen(false));
  const needsIns = TYPES_WITH_INSTRUMENT.includes(type);
  const trade = type === "buy" || type === "sell";
  return (
    <Sheet
      title="Registrar operación"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="primary" size="sm">
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
          <Button variant="primary" type="submit" disabled={pending} className="ml-auto min-w-32">
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
        <p className="col-span-2 text-[13px] text-ink-3">Registra también cada ingreso de dinero en el bróker como «Aportación»: así la rentabilidad es exacta.</p>
      </form>
    </Sheet>
  );
}

export function InstrumentForm({ instrument, trigger }: { instrument?: Instrument; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(instrument?.price_source ?? "eodhd");
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveInstrument, null);
  useSuccessToast(state, () => setOpen(false));
  return (
    <Sheet
      title={instrument ? "Editar instrumento" : "Nuevo instrumento"}
      open={open}
      onOpenChange={setOpen}
      trigger={
        trigger ?? (
          <Button size="sm">
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
          <Button variant="primary" type="submit" disabled={pending} className="ml-auto min-w-32">
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

export function DeleteButton({ id, kind, label }: { id: string; kind: "tx" | "instrument"; label: string }) {
  const [pending, start] = useTransition();
  return (
    <ConfirmDialog
      title={`¿${label}?`}
      description={kind === "tx" ? "La operación se elimina del registro y la cartera se recalcula." : "Se elimina el instrumento de tu cartera."}
      confirmLabel="Borrar"
      onConfirm={() =>
        start(() =>
          (kind === "tx" ? deleteTransaction(id) : deleteInstrument(id)).then(
            () => void toast.success(kind === "tx" ? "Operación borrada" : "Instrumento borrado"),
            (e: Error) => void toast.error(e.message),
          ),
        )
      }
      trigger={
        <button disabled={pending} aria-label={label} title={label} className="tap rounded-full p-2 text-ink-3 hover:bg-neg-soft hover:text-neg disabled:opacity-40">
          <IconTrash size={15} />
        </button>
      }
    />
  );
}

export function ManualPriceForm({ instruments }: { instruments: Instrument[] }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(addManualPrice, null);
  useSuccessToast(state);
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
  useSuccessToast(state);
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

const PLAN_DOT = { core: "bg-accent", gold: "bg-[#e3a008]", momentum: "bg-[#7048e8]" } as const;

export function ContributionPlanner({ values, other, settings }: { values: Record<"core" | "gold" | "momentum", number>; other: number; settings: Settings }) {
  const [amount, setAmount] = useState(String(settings.monthly_contribution));
  const a = Number(amount.replace(",", ".")) || 0;
  const plan = contributionPlan(values, other, settings.targets, a);
  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-4 py-2">
        <span className="text-[15px] text-ink-2">Importe</span>
        <span className="flex items-center gap-1">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            aria-label="Importe de la aportación"
            className="num w-24 bg-transparent text-right text-[22px] font-bold outline-none"
          />
          <span className="text-[22px] font-bold">€</span>
        </span>
      </label>
      <ul className="flex flex-col gap-3">
        {(["core", "gold", "momentum"] as const).map((k) => (
          <li key={k} className="flex items-center justify-between text-[15px]">
            <span className="flex items-center gap-2.5">
              <span className={`h-2.5 w-2.5 rounded-full ${PLAN_DOT[k]}`} />
              {BUCKET_LABELS[k]}
            </span>
            <span className="num font-semibold">{money(plan[k], "EUR", 0)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-ink-3">Reparto que te acerca a tu objetivo sin vender nada. Las compras las haces tú en tu bróker.</p>
    </div>
  );
}
