import Link from "next/link";

import { ActionPill, AssetAvatar, DeltaPill } from "@/components/fin/fin";
import { ProductCard } from "@/components/plan/product";
import { ContributionPlanner } from "@/components/portfolio/forms";
import { PageHeader } from "@/components/shell/page-header";
import { Callout, Card } from "@/components/ui/primitives";
import { dateLabel, money, pct } from "@/lib/format";
import { hasActions } from "@/lib/market/radar";
import { getRadar, loadMarket } from "@/lib/market/source";
import { MIN_SLEEVE_FOR_STOCKS_EUR, momentumRoute, productsFor, recommended, STOCK_POSITIONS, VERIFIED_ON } from "@/lib/plan/catalog";
import { targetDeviation } from "@/lib/portfolio/engine";
import { loadPortfolio } from "@/lib/portfolio/load";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Plan" };

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
          <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12.5px] font-bold text-accent-2">{i + 1}</span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function PlanPage() {
  const { latest, meta } = await loadMarket();
  const store = await requireStore();
  const [radar, pf] = await Promise.all([getRadar(latest), loadPortfolio(store, latest, meta)]);
  const res = pf.result;
  const dev = res ? targetDeviation(res, pf.settings) : null;
  const values = dev ? (Object.fromEntries(dev.map((d) => [d.bucket, d.value])) as Record<"core" | "gold" | "momentum", number>) : { core: 0, gold: 0, momentum: 0 };
  const core = recommended("core");
  const gold = recommended("gold");
  const momEtf = recommended("momentum");
  const route = momentumRoute(values.momentum);
  const rows = radar?.rows ?? [];
  const candidates = hasActions(rows) ? rows.filter((r) => r.cls === "stock" && r.act === "candidate").sort((a, b) => a.rank - b.rank).slice(0, STOCK_POSITIONS) : [];
  const t = pf.settings.targets;
  const monthly = pf.settings.monthly_contribution;

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4">
      <PageHeader title="Tu plan" sub="Qué comprar cada mes, con qué producto y por qué. Pensado para un residente fiscal en España." />

      <Card title="Este mes" sub={`Reparto de tu aportación para acercarte a ${pct(t.core, 0, false)} núcleo · ${pct(t.gold, 0, false)} oro · ${pct(t.momentum, 0, false)} momentum sin vender nada`}>
        <ContributionPlanner
          values={values}
          other={res?.allocation.find((a) => a.bucket === "other")?.value ?? 0}
          settings={pf.settings}
          products={{
            core: `${core.name.replace(" UCITS ETF", "")} · ${core.isin}`,
            gold: `${gold.name} · ${gold.isin}`,
            momentum: route === "etf" ? `${momEtf.name.replace(" UCITS ETF", "")} · ${momEtf.isin}` : `Candidatas del radar (${STOCK_POSITIONS} acciones a partes iguales)`,
          }}
        />
      </Card>

      <Card title="Cómo hacerlo, paso a paso">
        <Steps
          items={[
            <>
              Crea en tu bróker un <b>plan de inversión mensual</b> (en Trade Republic son gratuitos) para el núcleo y el oro con los ISIN de abajo. Las órdenes sueltas cuestan 1 € y con
              importes pequeños esa comisión pesa: con 50 € es un 2 %.
            </>,
            <>
              Para el bloque de momentum:{" "}
              {route === "etf" ? (
                <>
                  mientras tengas menos de {money(MIN_SLEEVE_FOR_STOCKS_EUR, "EUR", 0)} en él, usa el <b>ETF de momentum</b>. Con menos dinero, {STOCK_POSITIONS} acciones serían posiciones de
                  menos de {money(MIN_SLEEVE_FOR_STOCKS_EUR / STOCK_POSITIONS, "EUR", 0)} y cada compra o venta (y su impuesto) se come la ventaja.
                </>
              ) : (
                <>
                  compra las <b>Candidatas</b> del radar a partes iguales (hasta {STOCK_POSITIONS}) y revísalas una vez al mes.
                </>
              )}
            </>,
            <>Una vez al mes, abre esta página: el reparto de arriba se recalcula para que lo que esté por debajo de su objetivo reciba más. Así reequilibras sin vender ni tributar.</>,
            <>No mires la cartera a diario. El plan funciona por constancia, no por acertar el momento.</>,
          ]}
        />
      </Card>

      <Card id="nucleo" title={`1. Núcleo global (${pct(t.core, 0, false)})`} sub="Es la base: todo el mercado mundial a coste mínimo. Aquí no se hace momentum ni se intenta acertar.">
        <div className="flex flex-col gap-3">
          {productsFor("core").map((p) => (
            <ProductCard key={p.isin} p={p} compact={!p.recommended} />
          ))}
        </div>
        <div className="mt-4">
          <Bullets
            items={[
              <>
                <b>¿All-World o MSCI World?</b> El All-World incluye los países emergentes (en torno al 10 %); el MSCI World solo desarrollados. Para un único fondo de por vida, el
                All-World es la opción más diversificada y ahora además es más barato (0,14 % frente a 0,20 %).
              </>,
              <>
                La diferencia entre las opciones es pequeña. Lo importante es <b>elegir uno y no cambiar</b>: en España un ETF no se puede traspasar sin tributar, así que cambiar de ETF
                significa vender y pagar impuestos sobre lo ganado.
              </>,
              <>
                Elige siempre la clase de <b>acumulación</b>: reinvierte los dividendos dentro del fondo y no tributas hasta que vendes. Con una de distribución pagarías IRPF cada año por
                los dividendos.
              </>,
              <>
                Alternativa a valorar: un <b>fondo indexado</b> (p. ej. Fidelity MSCI World Index Fund P-Acc-EUR, IE00BYX5NX33, 0,12 %) permite traspasos entre fondos sin tributar. No
                está en Trade Republic, sí en otros comercializadores españoles.
              </>,
            ]}
          />
        </div>
      </Card>

      <Card id="oro" title={`2. Oro (${pct(t.gold, 0, false)})`} sub="Diversifica: suele comportarse distinto que las acciones en las crisis. No genera rentas.">
        <div className="flex flex-col gap-3">
          {productsFor("gold").map((p) => (
            <ProductCard key={p.isin} p={p} compact={!p.recommended} />
          ))}
        </div>
        <div className="mt-4">
          <Bullets
            items={[
              <>
                En Europa el oro se compra mediante <b>ETC</b>, no ETF: la normativa UCITS no permite un fondo de un solo activo. Un ETC es un título de deuda del emisor
                respaldado por lingotes reales; si el emisor quebrara, el oro depositado garantiza la emisión.
              </>,
              <>
                Elige por <b>comisión y respaldo físico</b>: iShares e Invesco cobran 0,12 % y guardan los lingotes en Londres. Son equivalentes; el recomendado es uno de los de mayor
                tamaño.
              </>,
              <>
                Xetra-Gold es muy popular en Alemania porque allí está exento de impuestos tras un año. Esa ventaja es de la ley alemana: <b>a un residente en España no le aplica</b>.
              </>,
              <>
                Fiscalidad en España: ver la sección de abajo. En resumen, al vender tributa en la base del ahorro como cualquier otra inversión, pero clasificado como rendimiento del
                capital mobiliario.
              </>,
            ]}
          />
        </div>
      </Card>

      <Card id="momentum" title={`3. Momentum (${pct(t.momentum, 0, false)})`} sub="La parte activa: empresas con la tendencia más fuerte. Es la más arriesgada, por eso es la más pequeña.">
        <Callout tone="info" title="¿Comprar lo que más ha subido no es comprar caro?">
          Es la pregunta correcta. El momentum consiste precisamente en comprar lo que ha subido, y décadas de datos muestran que, de media, las líderes de los últimos 6‑12 meses siguen
          batiendo al mercado durante unos meses más. Pero «ha subido mucho» no es lo mismo que «ha subido demasiado deprisa»: las subidas explosivas del último mes tienden a corregir
          parte (reversión a corto plazo). Por eso la puntuación ignora el último mes, y por eso el radar separa <b>Candidatas</b> (fuertes y ordenadas) de <b>Esperar retroceso</b>{" "}
          (se han disparado). Además, el radar avisa si la empresa pierde dinero o tiene un PER muy alto. Lo que no hace es un análisis de valoración completo.
        </Callout>
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[15px] font-semibold">Opción sencilla (recomendada con menos de {money(MIN_SLEEVE_FOR_STOCKS_EUR, "EUR", 0)}): un ETF de momentum</p>
          <ProductCard p={momEtf} />
          <p className="mt-2 text-[15px] font-semibold">Opción radar: acciones individuales</p>
          <Bullets
            items={[
              <>
                <b>Comprar:</b> solo las que el radar marca como <ActionPill action="candidate" />, a partes iguales, hasta {STOCK_POSITIONS}. Nunca más de un 10 % del bloque en una sola.
              </>,
              <>
                <b>No comprar todavía:</b> <ActionPill action="wait" /> (se ha disparado: espera a que se modere) y <ActionPill action="watch" /> (le falta algo para ser compra).
              </>,
              <>
                <b>Vender:</b> cuando una que tienes pase a «Revisar venta»: sale de la mitad más fuerte del universo o pasa a <ActionPill action="avoid" />. No vendas solo porque haya
                dejado de ser Candidata: esa holgura evita comprar y vender continuamente (y tributar por ello).
              </>,
              <>
                <b>Revisión:</b> una vez al mes, no más. El momentum se mide en meses.
              </>,
              <>
                <b>Pérdidas y recompras:</b> si vendes con pérdidas y vuelves a comprar la misma acción dentro del plazo legal (2 meses en mercados de la UE; para acciones que solo cotizan
                en EE. UU., Hacienda aplica habitualmente 1 año), esa pérdida no se puede compensar ese año. La cartera te avisa si ocurre.
              </>,
            ]}
          />
          {candidates.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-[18px] bg-surface-2">
              <p className="px-4 pt-3 text-[13.5px] text-ink-2">Candidatas hoy (cierre del {dateLabel(latest?.data_asof)})</p>
              <ul className="divide-y divide-line">
                {candidates.map((r) => (
                  <li key={r.t}>
                    <Link href={`/research/${r.t}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-3">
                      <AssetAvatar t={r.t} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{r.n}</span>
                        <span className="block truncate text-[12.5px] text-ink-2">
                          {r.t} · puntuación {Math.round(r.ov)} · {r.prof === false ? "pérdidas" : r.pe ? `PER ${Math.round(r.pe)}` : "PER n/d"}
                        </span>
                      </span>
                      <DeltaPill v={r.r6m} />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/radar?preset=buy" className="block px-4 py-3 text-[14px] font-medium text-accent">
                Ver todas en el radar
              </Link>
            </div>
          )}
        </div>
      </Card>

      <Card id="fiscalidad" title="Fiscalidad en España (resumen)" sub="Información general a fecha de hoy. No sustituye a un asesor fiscal.">
        <Bullets
          items={[
            <>
              Todo lo que ganes con estas inversiones va a la <b>base del ahorro</b> del IRPF: 19 % hasta 6.000 €, 21 % hasta 50.000 €, 23 % hasta 200.000 €, 27 % hasta 300.000 € y 30 %
              por encima (escala vigente desde 2025).
            </>,
            <>
              <b>ETFs y acciones:</b> tributas solo cuando vendes, por la diferencia entre lo que obtienes y lo que pagaste (comisiones incluidas). Si compraste en varias veces, se
              considera que vendes primero lo más antiguo (FIFO); la cartera lo calcula así. No hay retención al vender: lo declaras tú.
            </>,
            <>
              <b>ETC de oro:</b> la Dirección General de Tributos (consulta vinculante V0267‑25, de 13‑03‑2025) los trata como <b>rendimiento del capital mobiliario</b> por ser
              títulos de deuda, no como ganancia patrimonial. Mismos tipos; la diferencia está en la compensación: las pérdidas de un bloque solo compensan hasta el 25 % de las ganancias
              del otro. Puede llevar retención del 19 % si tu bróker la aplica.
            </>,
            <>
              <b>Dividendos de acciones de EE. UU.:</b> EE. UU. retiene un 15 % (con el formulario W‑8BEN, que el bróker gestiona) y en la Renta te deduces esa doble imposición hasta
              ese límite. Desde 2025 la sucursal española de Trade Republic retiene además el 19 % español sobre intereses y dividendos.
            </>,
            <>
              <b>ETFs de EE. UU. (SPY, QQQ…):</b> como particular en la UE no puedes comprarlos (normativa PRIIPs). Por eso aquí solo aparecen ETFs UCITS europeos, domiciliados en Irlanda
              (el domicilio habitual por su convenio fiscal con EE. UU.).
            </>,
            <>
              <b>Modelo 720:</b> si tus valores depositados en el extranjero superan 50.000 € a 31 de diciembre, hay que informar de ellos. Comprueba con tu bróker si los tuyos cuentan
              como depositados fuera de España.
            </>,
          ]}
        />
      </Card>

      <p className="px-1 text-[12.5px] text-ink-3">
        Datos de productos verificados el {dateLabel(VERIFIED_ON)} en las webs de las gestoras y en comparadores (justETF, extraETF, Finanzfluss). Las comisiones cambian: comprueba el
        documento KID antes de comprar y que el producto esté disponible en tu bróker. WarrenIA es una herramienta de análisis, no un asesor financiero; tu aportación mensual configurada
        es de {money(monthly, "EUR", 0)}.
      </p>
    </div>
  );
}
