# WarrenIA — Plan maestro (v0.1, pendiente de validación)

> Estado: **borrador para validar**. No se ha escrito código de producto todavía.
> Fecha: 2026-10-10.

---

## 0. Resultado de la auditoría

| Elemento | Hallazgo |
|---|---|
| Repositorio `hshector/WarrenIA` | **Vacío.** Sin commits, sin ramas remotas, sin ficheros. |
| Stack, componentes, tests, despliegue | Inexistentes en este repositorio. |
| Datos, tracker, informes de momentum previos | No encontrados. |

**Consecuencia:** lo planteo como un proyecto nuevo (*greenfield*). Si el "proyecto actual" existe en otro sitio
(local, otro repo, notebooks, una hoja de cálculo con operaciones), **hay que subirlo antes de empezar** para
auditarlo y reaprovechar cálculos y datos. Es la decisión D1 (sección 12).

Como no hay nada que conservar, cambio el orden de las fases (sección 10). El sistema de diseño empieza en paralelo
con el motor, para que ninguna pantalla se construya dos veces. La validación cuantitativa (backtest) va **antes** de
congelar la metodología, no al final.

---

## 1. Arquitectura objetivo

```
                ┌──────────────────────────── GitHub Actions (cron + manual) ───────────────────────────┐
                │  engine/ (Python)                                                                      │
 Proveedores ──►│  1 ingest → 2 normalize/validate → 3 store → 4 indicators → 5 scores/rank → 6 reports  │
 (EOD, SEC,     │                     │                    │                                             │
  ECB, iShares) │                     ▼                    ▼                                             │
                └────────── Parquet histórico ──── Postgres (resultados, snapshots, metadatos) ──────────┘
                            (Supabase Storage)          (Supabase)
                                                          ▲   ▲
                                                          │   │  RLS por usuario
                ┌───────────────── Vercel ────────────────┴───┴───────────────────────────────────────┐
                │  web/ (Next.js + TypeScript)                                                          │
                │  · Server Components leen resultados ya calculados (nunca llaman al proveedor por      │
                │    cada componente)                                                                    │
                │  · Route handlers protegidos: transacciones, watchlist, "Actualizar ahora"             │
                │    (dispara workflow_dispatch), importación CSV                                        │
                │  · Módulo portfolio/ en TS: FIFO, P&L, TWR, XIRR, exposición (cálculo interactivo)     │
                │  · PWA: manifest + service worker que nunca sirve datos sin su sello de fecha          │
                └───────────────────────────────────────────────────────────────────────────────────────┘
```

### Por qué este reparto (y no otro)

| Decisión | Motivo | Alternativa descartada |
|---|---|---|
| **Next.js (App Router) + TypeScript** en Vercel | Es el destino de despliegue; los Server Components leen la base de datos sin exponer claves; el soporte PWA es maduro. | SPA pura: obligaría a exponer la base de datos o a montar un backend aparte. |
| **Python para el motor de mercado** | Cálculo vectorizado sobre unos 2.500 activos × años de historia, backtests y calendarios de mercado (`pandas_market_calendars`). Ecosistema cuantitativo estándar, fácil de verificar. | TS para todo: peor ecosistema numérico y backtests más frágiles. |
| **GitHub Actions como ejecutor programado** | Gratis, jobs de hasta 6 h, cron y `workflow_dispatch` (permite el botón "Actualizar"). No depende de que la web esté abierta ni de mi ordenador. | Vercel Cron: en Hobby solo una ejecución al día y tiempo de función limitado; no sirve para ingesta + cálculo + backtest. Un servidor propio (VPS): más mantenimiento sin necesidad. |
| **Cartera en TypeScript** (no en Python) | Al registrar una operación el resultado debe ser inmediato. Así cada dominio tiene un único lenguaje: *mercado = Python*, *cartera = TS*, y no se duplica lógica. | Calcular la cartera en el job diario: la rentabilidad no se actualizaría al añadir operaciones. |
| **Supabase** (Postgres + Auth + Storage) | Un solo proveedor cubre base de datos persistente, autenticación con aislamiento por usuario (RLS) y almacenamiento de ficheros Parquet. | Neon + Auth.js + R2: tres proveedores para lo mismo. |
| **Parquet para el histórico completo y Postgres para los resultados** | El histórico de precios completo no cabe con holgura en los 500 MB gratuitos de Postgres. Postgres guarda la ventana de 2 años (gráficos), los scores, los snapshots y la cartera. | Todo en Postgres: obligaría a pasar al plan Pro (25 $/mes) desde el primer día. |

**Restricción de licencias:** casi todos los proveedores EOD prohíben redistribuir datos. Por eso **toda la app
queda detrás de login** (solo tu cuenta; lista de correos permitidos) y los datos de mercado no se exponen
públicamente.

### Estructura del repositorio

```
/web                    Next.js (raíz del proyecto en Vercel)
  /app                  rutas: overview, radar, research/[ticker], portfolio, watchlist, settings
  /components           sistema de diseño (primitivas + componentes financieros)
  /lib/portfolio        FIFO, P&L, TWR, XIRR, FX, pesos objetivo (puro, testeado)
  /lib/db               acceso tipado a Postgres
/engine                 paquete Python `warrenia_engine`
  /providers            adaptadores intercambiables (eodhd, massive, sec, ecb, ishares, yahoo-fallback)
  /pipeline             ingest, validate, store
  /indicators           retornos, medias, ATR, drawdown, beta, RS
  /scoring              scores, clasificación, explicaciones, sensibilidad
  /backtest             motor walk-forward, costes, métricas
  /reports              fichas estructuradas (deterministas)
  /tests
/config                 universe.yaml, momentum.yaml, benchmarks.yaml, portfolio_targets.yaml
/supabase/migrations    esquema SQL + políticas RLS
/docs                   ARCHITECTURE, METHODOLOGY, DATA_SOURCES, BACKTEST, DEPLOY, PLAN
/.github/workflows      ci.yml, daily-update.yml, backtest.yml
```

---

## 2. Fuentes de datos

### 2.1 Necesidades y candidatos

| Necesidad | Recomendado | Respaldo / alternativa | Notas |
|---|---|---|---|
| Precios EOD EE. UU. (acciones + ETFs), ajustados | **EODHD "EOD All World"** (~20 €/mes): endpoint *bulk* (todo un exchange en una llamada), histórico de décadas, splits y dividendos, **tickers deslistados** | **Massive (antes Polygon) gratuito**: 5 llamadas/min, EOD, **solo 2 años de historia**; "grouped daily" (todo el mercado de un día en una llamada) | Sin deslistados no hay backtest libre de sesgo de supervivencia. Con 2 años sí hay ranking en vivo (12‑1 necesita unas 273 sesiones), pero no hay validación seria. |
| Precios de ETFs UCITS en EUR (Xetra) para la cartera | **EODHD** (cubre XETRA) | `yfinance` limitado a 3‑5 tickers de cartera, con caché | yfinance no es una API oficial, sufre 429/bloqueos de IP y Yahoo restringe el uso. Solo como respaldo y marcado como tal. |
| Listado del universo (NYSE/Nasdaq, flag ETF) | **NASDAQ Trader Symbol Directory** (`nasdaqlisted.txt`, `otherlisted.txt`): oficial y gratuito | Lista de símbolos de EODHD | No incluye capitalización. |
| Capitalización bursátil | **SEC XBRL** (`dei:EntityCommonStockSharesOutstanding`, con fecha de presentación) × precio | Fundamentales del proveedor | Point‑in‑time por fecha de *filing*. Limitaciones documentadas: varias clases de acciones (GOOG/GOOGL) y ADRs/20‑F con cobertura parcial. |
| Sector | **SIC de la SEC → mapeo propio a 11 sectores** (tabla versionada) | Sector del proveedor | **No es GICS** (GICS es propietario). Se indicará en la interfaz. |
| Fortaleza sectorial | **ETFs sectoriales SPDR** (XLK, XLF, …) | — | Fuente de precios fiable y comparable. |
| Divisas | **Tipos de referencia del BCE** (diarios, oficiales) | — | Conversión a EUR en la cartera. |
| Composición de ETFs (solapamiento) | **CSV de holdings publicado por la gestora** (p. ej. iShares), guardado con fecha y URL de origen | — | Depende del ETF exacto que tengas (D3). |
| ISIN → ticker | **OpenFIGI** (gratuito, con límite) | Mapeo manual | Para las operaciones de Trade Republic, que usan ISIN. |
| Calendario y zona horaria | `pandas_market_calendars` (NYSE, XETR) | — | Determina la "última sesión esperada" y, con ella, si los datos están obsoletos. |

> Los precios y límites de los proveedores proceden de fuentes de terceros y **deben confirmarse en sus webs
> oficiales al contratar**. La arquitectura usa adaptadores para que cambiar de proveedor sea un cambio de
> configuración.

### 2.2 Recomendación

- **Opción B (recomendada): EODHD ~20 €/mes.** Una sola fuente coherente para EE. UU. y Xetra, con histórico largo,
  deslistados (backtest honesto) y bulk diario (unas pocas llamadas al día). Uso personal, sin redistribución.
- **Opción A (0 €):** Massive gratis + SEC + BCE + yfinance limitado para los ETFs UCITS. El radar funciona; el
  **backtest queda restringido a unos 2 años con sesgo de supervivencia** y se marcará como no concluyente.
  Se puede migrar a B más adelante sin reescribir nada.

### 2.3 Política de actualización y frescura

- **Job diario:** después del cierre de NYSE (≈ 23:30 UTC), con un reintento a las 02:00 UTC. Ingesta incremental
  (solo sesiones nuevas), con backoff exponencial y presupuesto de llamadas por proveedor.
- **Botón "Actualizar":** ruta protegida → `workflow_dispatch`. Tiene un enfriamiento de 15 min y la interfaz
  muestra el estado del job. Si no hay sesión nueva desde la última ejecución, se indica en lugar de recalcular.
- **Cada respuesta lleva su sello:** `data_asof` (fecha de la sesión de cierre y su zona horaria), `computed_at`,
  `provider`, `run_id` y el hash de la configuración. La interfaz muestra **la fecha de los datos, no la hora de
  apertura de la página**.
- **Obsolescencia:** `stale` si `data_asof` < última sesión cerrada según el calendario + margen. En ese caso la
  interfaz muestra una banda de aviso, atenúa el ranking y presenta el estado como "Datos del 7 oct. — el último
  cierre disponible es el 9 oct.".
- **Tipo de dato:** todo es **de cierre (EOD)**. El MVP no tiene datos intradía; si una consulta los necesita, se
  dice y se ofrece la alternativa diaria.

### 2.4 Validación de datos (bloquea la publicación del ranking si falla a nivel global)

- Sesiones ausentes comparadas con el calendario, filas duplicadas y precios ≤ 0 o nulos.
- Retornos diarios superiores al 50 % sin split registrado: el activo se marca y se excluye con su motivo.
- Coherencia del factor de ajuste (adj/raw) con la tabla de splits.
- Último precio sin volumen durante N sesiones: precio obsoleto, se excluye.
- Cobertura mínima del universo por ejecución: si cae por debajo del umbral, la ejecución se marca como fallida
  y se mantiene visible el último ranking válido **con su fecha**.
- Cada activo excluido conserva su motivo, consultable en Settings/Data.

---

## 3. Universo

Se define en `config/universe.yaml`. Valores iniciales, todos configurables:

| Filtro | Acciones | ETFs |
|---|---|---|
| Mercado | NYSE, Nasdaq, NYSE American; acciones ordinarias y ADRs (configurable) | ETFs cotizados en EE. UU. |
| Capitalización | ≥ 2.000 M$ (*mid + large*) | n/a |
| Volumen monetario medio (63 sesiones) | ≥ 20 M$/día | ≥ 10 M$/día |
| Precio mínimo | ≥ 5 $ | ≥ 5 $ |
| Historial | ≥ 273 sesiones (necesario para 12‑1 y SMA200) | igual |
| Exclusiones | SPACs, warrants, units, preferentes | Apalancados e inversos (heurística por nombre, documentada) |

- **Estimación** (se medirá y publicará en cada ejecución, no se presupone): unas 1.500‑2.000 acciones y unos
  400‑600 ETFs.
- **Cobertura declarada:** "Acciones de EE. UU. con capitalización ≥ 2.000 M$ y liquidez ≥ 20 M$/día". No equivale
  a "todo el mercado". Otros mercados se añadirán solo con datos comparables.
- Las acciones y los ETFs **se puntúan y se muestran por separado**.

---

## 4. Metodología de momentum (v1)

### 4.1 Base en la literatura

| Idea | Referencia | Cómo se usa |
|---|---|---|
| Momentum 12‑1 (excluye el último mes por la reversión a corto plazo) | Jegadeesh & Titman (1993); Jegadeesh (1990); Carhart (1997) | Señal núcleo |
| Momentum ajustado por riesgo, combinación de 6 y 12 meses | Metodología de los MSCI Momentum Indexes; Barroso & Santa‑Clara (2015) | Retorno / volatilidad |
| Proximidad al máximo de 52 semanas | George & Hwang (2004) | Trend Quality |
| Consistencia del camino (*frog in the pan*) | Da, Gurun & Warachka (2014); Gray & Vogel (*Quantitative Momentum*) | Trend Quality |
| Filtros de tendencia con medias móviles | Faber (2007); Moskowitz, Ooi & Pedersen (2012) | Estructura de tendencia |
| Momentum residual (frente al mercado) | Blitz, Huij & Martens (2011) | Contexto "lidera o solo acompaña" |
| *Crashes* de momentum tras mercados bajistas | Daniel & Moskowitz (2016) | Riesgo documentado y análisis por régimen |
| Momentum sectorial | Moskowitz & Grinblatt (1999) | Contexto sectorial |

### 4.2 Normalización

Para cada factor: winsorización al percentil 1/99 dentro del universo del día y después **rango percentil
transversal (0‑100)**.

Se usan percentiles en lugar de z‑scores porque son robustos a colas gordas, comparables entre factores y fáciles
de interpretar. Cada score es la media ponderada de los percentiles de sus componentes, re‑expresada como
percentil.

> **Observación metodológica:** el retorno relativo frente a un benchmark común es el retorno absoluto menos una
> constante, así que **no cambia el orden transversal**. Por eso no se añade como factor de ranking (sería ruido
> o doble conteo). Se muestra como contexto y se usa en la etiqueta "bate al mercado". Lo que sí distingue al
> líder del que solo sube con el mercado es el **momentum residual** (tras quitar beta), que se presenta como
> métrica de contexto.

### 4.3 Scores

| Score | Componentes (pesos iniciales) | Convención |
|---|---|---|
| **Momentum Score** | 50 % retorno 12‑1 / vol 252d · 50 % retorno 6‑1 / vol 252d | 0‑100, más alto = más fuerte |
| **Trend Quality** | 25 % consistencia (proporción de días positivos en 12‑1) · 25 % R² de la regresión log‑precio en 126d · 25 % estructura de medias (P>SMA50, P>SMA200, SMA50>SMA200, pendiente de SMA200 > 0, pendiente de SMA50 > 0; puntuación 0‑5) · 25 % precio / máximo de 252d | 0‑100, más alto = tendencia más limpia |
| **Acceleration Score** | 50 % variación del percentil de Momentum en 21 sesiones (recalculado desde los precios, reproducible sin snapshots) · 50 % pendiente robusta (Theil‑Sen) de la línea RS frente al benchmark en 21d menos la de las 63d previas, normalizada por vol | 0‑100, más alto = acelera |
| **Risk Score** | percentiles de: vol 63d, ATR14 %, drawdown máximo 252d, beta 252d, frecuencia de gaps > 2×ATR (126d), concentración (parte del movimiento explicada por las 5 mayores sesiones de 126d) | **0 = menor riesgo del universo; 100 = mayor riesgo.** Además se muestra la vol anualizada absoluta, porque un percentil 90 en un mercado tranquilo puede ser un riesgo moderado. |
| **Overall Momentum Rank** | 50 % Momentum · 25 % Trend Quality · 10 % Acceleration · 15 % (100 − Risk) | Orden final, solo entre activos elegibles |

**Justificación de los pesos (fijados *a priori*, no optimizados):**

- **Momentum** es el factor con mayor evidencia empírica y por eso domina.
- **Trend Quality** recoge efectos con evidencia propia (52 semanas, consistencia) que no coinciden del todo con
  el retorno.
- **Acceleration** tiene un peso bajo: la evidencia es más débil y choca con la reversión a 1 mes.
- **Riesgo** actúa como ajuste de calidad. El Momentum ya divide por la volatilidad, así que aquí solo se
  penaliza lo que la volatilidad no recoge: gaps, concentración y drawdown. Por eso pesa 15 % y no más.

**Matriz de correlación:** se calculará y publicará entre componentes. Si dos componentes tienen ρ > 0,8, se
fusionan o se elimina uno, y se documenta la decisión.

**Sensibilidad:** se perturban los pesos con 1.000 muestras Dirichlet alrededor de los pesos base. Se mide el
ρ de Spearman del ranking completo y el solapamiento del top‑25. Se publica en Settings/Data. Objetivo declarado
de antemano: un solapamiento mediano del top‑25 ≥ 70 %. Si no se alcanza, se informa y se simplifica el modelo,
nunca se ajustan los pesos al backtest.

Todo (pesos, ventanas, umbrales) vive en `config/momentum.yaml`. Cada ejecución guarda el hash de la
configuración.

### 4.4 Elegibilidad y razones

- Antes de ordenar se aplican los filtros del universo y de calidad de datos. Un activo no elegible no recibe
  rango; se muestra el motivo.
- **Explicaciones:** se generan de forma determinista a partir de las contribuciones de cada componente. Por
  ejemplo: "Momentum en p96 (12‑1: +84 %, vol 31 %) · a 2 % del máximo de 52s · RS acelerando · Riesgo p71 por gaps".

### 4.5 Clasificación (reglas explícitas, umbrales en la configuración)

Un activo puede llevar varias etiquetas y tiene **un estado principal**, asignado por este orden de precedencia:

| Orden | Estado | Regla inicial |
|---|---|---|
| 1 | **High Volatility / Speculative** | Risk ≥ 90 o vol 63d > 70 % anualizada |
| 2 | **Extended / Overheated** | Momentum ≥ 70 y (precio > SMA50 + 3×ATR14, o distancia a la SMA200 por encima del percentil 95 de su propia historia de 3 años) |
| 3 | **Weakening Momentum** | Momentum ≥ 50 y (el percentil cae ≥ 15 puntos en 21d, o el precio cruza por debajo de la SMA50 tras ≥ 40 sesiones por encima, o Acceleration ≤ 25) |
| 4 | **Early Breakout** | Cierre > máximo previo de 126d en las últimas 10 sesiones, volumen ese día ≥ 1,5× la media de 50d, consolidación previa (rango de 40d ≤ k×ATR). La interfaz indica "necesita confirmación". |
| 5 | **Strong Uptrend** | Momentum ≥ 80, Trend Quality ≥ 70, precio > SMA50 > SMA200, a menos de un 10 % del máximo de 52s |
| 6 | **Improving Momentum** | Percentil sube ≥ 15 puntos en 21d y Acceleration ≥ 70 |
| — | Neutral | Ninguna de las anteriores |

Ninguna etiqueta implica una rentabilidad futura. El texto legal de la interfaz lo dirá de forma breve y clara.

---

## 5. Validación cuantitativa (backtest)

**Requisito:** opción B de datos (histórico largo con deslistados). Con la opción A se ejecuta igualmente, pero
con la advertencia "no concluyente".

- **Universo point‑in‑time:** incluye deslistados. La capitalización usa la fecha de *filing* de la SEC y la
  liquidez se calcula solo con datos anteriores a la señal.
- **Señal y ejecución:** la señal se calcula al cierre del último día del mes y se ejecuta **en la apertura de la
  sesión siguiente**; como alternativa conservadora, al cierre t+1. Sin look‑ahead.
- **Costes:** 10 pb por lado más deslizamiento proporcional a 1/ADV; también se prueba con 25 pb. Se reportan el
  turnover y el coste total.
- **Estrategias:**
  - (a) 12‑1 puro, top‑N
  - (b) momentum ajustado por riesgo (MSCI)
  - (c) Overall Rank completo
  - (d) (c) con filtros de liquidez y riesgo
  - Variantes: N = 20/30/50, ponderación equitativa, rebalanceo mensual o trimestral
- **Referencias:** SPY, RSP (equiponderado) y un buy‑and‑hold del universo equiponderado.
- **Métricas:** CAGR, vol, Sharpe, Sortino, Max DD, Calmar, turnover, costes, número de posiciones,
  concentración (HHI), exposición sectorial y resultados por régimen (SPY por encima/debajo de la SMA200, terciles
  de volatilidad, ventanas posteriores a bajistas para detectar *crashes*).
- **Periodos:** desarrollo 2005‑2015 · validación 2016‑2020 · **evaluación final 2021‑hoy, que se ejecuta una sola
  vez** cuando la metodología esté congelada. Walk‑forward para cualquier parámetro que se revise.
- **Resultado:** `docs/BACKTEST.md` con tablas y gráficos y una sección de limitaciones. Los resultados no se
  presentan como promesa de rentabilidad futura.

---

## 6. Momentum Radar y consultas

### 6.1 Radar (página central)

- **Tabla virtualizada** (TanStack Table + Virtual) para cientos de filas. Columnas: rango, Δrango a 21d, ticker,
  nombre, precio, var. 1d, retornos a 1/3/6/12m, relativo frente al benchmark, Momentum, Trend Quality,
  Acceleration, Risk, sector, estado, razón principal y fecha de los datos.
- **Columnas por presets:** Compacto, Retornos, Scores y Riesgo, para que la tabla no se convierta en un caos.
- **Filtros:** sector, capitalización, liquidez, mercado, tipo (acciones/ETFs), riesgo máximo, estado y
  "solo en cartera / watchlist".
- **Otros controles:** ordenar por cualquier score, horizonte (cambia la columna de retorno destacada y la
  ordenación), benchmark (SPY, RSP, QQQ, MDY; afecta a las métricas relativas y a la RS) y comparador de 2 a 4
  activos.
- **Ficha de detalle (Research):** precio con SMA 50/200, línea RS frente al benchmark, drawdown, evolución del
  rango (si hay snapshots), desglose de cada score por componente, tesis estructurada y relación con la cartera.
- **Móvil:** filas compactas (ticker · estado · Overall · Δ) que se expanden. Los filtros van en una hoja inferior.

### 6.2 Consultas tipo, resueltas por el motor

Cada pregunta del brief se convierte en un **preset de filtro y orden determinista**:

| Consulta | Resolución |
|---|---|
| Momentum más fuerte ahora | Overall Rank, solo elegibles |
| Más aceleración | Acceleration desc., con Momentum ≥ 50 |
| Momentum fuerte con volatilidad baja | Momentum ≥ 80, orden por Risk asc. |
| Líderes perdiendo impulso | Momentum ≥ 70 con estado Weakening, o Δ percentil en 21d ≤ −15 |
| Máximos con confirmación de volumen | Early Breakout, o nuevo máximo de 52s con volumen ≥ 1,5× |
| Más mejora de rango en el mes | Δrango a 21d desc. |

**LLM (opcional, fase 6):**

- **Texto libre → DSL de filtros:** un LLM traduce la pregunta a filtros validados por un esquema, y el motor los
  ejecuta.
- **Redacción de informes:** un LLM puede redactar la ficha a partir del JSON de métricas, con una comprobación
  automática de que cada número del texto existe en ese JSON. Si falla, se usa la plantilla determinista.
- Requiere `ANTHROPIC_API_KEY`. Sin la clave, todo funciona con las plantillas.

### 6.3 Fichas de oportunidades

Las fichas usan las secciones Thesis / Evidence / Risks / Invalidation / Data quality / Portfolio relevance.

- **Contenido determinista:** sale de las métricas.
- **Invalidación:** condiciones observables (cierre por debajo de la SMA50, percentil de Momentum < 50, RS que
  rompe su mínimo de 63d…), **sin precios objetivo ni stops inventados**.
- **Aviso fijo:** "Ranking cuantitativo, no análisis fundamental".

### 6.4 Snapshots

- Cada ejecución guarda el ranking completo en la tabla `rank_snapshots` (activo, fecha, rango y scores).
- Con esos datos se construyen el historial de rango y el Δrango, y cualquier ranking pasado se puede reproducir.

---

## 7. Portfolio Tracker

### 7.1 Modelo de datos

| Entidad | Contenido |
|---|---|
| `instruments` | ISIN, ticker por mercado, tipo, divisa y fuente de precio |
| `transactions` | compra, venta, aportación, retirada, dividendo, comisión, ajuste corporativo (split, cambio de ISIN); fecha, unidades, precio, divisa, comisión y nota |
| `cash_accounts` | efectivo por divisa (opcional) |
| `portfolio_targets` | núcleo MSCI World 75 %, oro 10 %, momentum/acciones 15 %, con bandas de tolerancia |

Todas las tablas son por usuario, con **RLS**.

### 7.2 Entrada de operaciones

- **Formulario manual** con validación (fechas, unidades > 0, no vender más de lo que se tiene, divisa).
- **Importación CSV con vista previa:** mapeo de columnas, detección de duplicados, errores por fila y
  confirmación antes de escribir nada.
- **Trade Republic:**
  - No se asume ninguna API pública.
  - No se piden credenciales.
  - El parser concreto se escribe con un CSV/extracto real tuyo (D4).

### 7.3 Cálculos (módulo puro en `web/lib/portfolio`, testeado)

| Cálculo | Método |
|---|---|
| Coste y P&L realizado | **FIFO**, coherente con la normativa del IRPF español para valores homogéneos. También se muestra el coste medio como referencia. |
| P&L no realizado y valor de mercado | Valoración en EUR con el tipo del BCE del día |
| Capital aportado | Separado del valor de mercado |
| TWR | Encadenamiento diario; los flujos externos se registran al inicio del día |
| MWR / XIRR | Newton con respaldo de bisección; se indica si no converge |
| Serie histórica | Reconstruida desde las operaciones y los precios. Las limitaciones (huecos de precio) se marcan en el gráfico. |
| Distribución | Por activo, clase, sector y divisa |
| Pesos objetivo | Desviación frente al objetivo con bandas (±5 pp absolutos o ±25 % relativo, configurable). Sugerencia informativa de rebalanceo **con nuevas aportaciones**; nunca órdenes. |
| Comisiones y dividendos | Acumulados por periodo |

### 7.4 Integración con el radar

- **Momentum de cada posición:** estado y alertas de pérdida de tendencia.
- **Señales en el radar:** "ya en cartera" y "aumentaría la exposición al sector X en +Y pp".
- **Exposición total a través de ETFs:** usa los holdings de la gestora con fecha y fuente, nunca una composición
  supuesta.

---

## 8. Diseño — "Orbital Finance Intelligence"

### 8.1 Sistema de diseño

**Paleta (tokens OKLCH en variables CSS):**

| Token | Valor inicial | Uso |
|---|---|---|
| `bg` | `#07090D` (carbón) | Fondo base |
| `surface-1`, `surface-2` | `#0C111A`, `#121826` (azul noche) | Superficies diferenciadas |
| `border` | blanco al 6‑10 % | Bordes sutiles |
| `text` | `#F2EEE8` (blanco cálido) | Texto principal |
| `text-2`, `text-3` | grises neutros | Etiquetas y metadatos |
| `accent` | `#F08A3C` (naranja cálido, ajustado a contraste AA) | Identidad |
| `accent-gradient` | — | **Solo** en la marca, el KPI principal y el indicador de rango |
| `pos`, `neg` | `#3FB68B`, `#E5534B` (verde y rojo desaturados) | Exclusivos para variaciones |

**Tipografía:**

- **Geist Sans** para la interfaz y **Geist Mono** para tickers y metadatos. Ambas son de código abierto.
- Cifras con `font-variant-numeric: tabular-nums`, alineadas a la derecha.
- Escala tipográfica de 6 pasos con roles distintos: título, etiqueta, valor principal, metadato, indicador y
  texto explicativo.

**Forma, espacio y movimiento:**

- Rejilla de espaciado de 4 px.
- Radios de 6/10 px.
- Sombras casi nulas: la profundidad se consigue con la luminancia de las superficies.
- Animaciones de 120‑200 ms, solo de transición de estado, respetando `prefers-reduced-motion`.

**Primitivas y gráficos:**

- **Radix** para la accesibilidad, con estilo propio y **sin el aspecto de plantilla shadcn**.
- **TradingView Lightweight Charts** (Apache‑2.0) para precio, medias y volumen.
- **SVG propio** para RS, drawdown, la barra de percentiles y la evolución del rango.

**Otros elementos:**

- **Componentes financieros propios:** `ScoreBar` (percentil con marca de mediana), `StatePill`, `FreshnessStamp`,
  `Delta` y `DataQualityBadge`.
- **Estados diseñados:** carga (skeletons con la forma real), vacío (qué hacer a continuación), error (qué falló
  y desde cuándo) y **demo** (banda visible).
- **Tema claro:** tokens preparados, pero se implementa después de cerrar el oscuro.

**Prohibido:** gradientes generalizados, glassmorphism, neón, partículas, emojis como iconos, KPIs redundantes y
titulares de marketing.

### 8.2 Navegación

- **Escritorio:** barra lateral estrecha con Overview · Momentum Radar · Research · Portfolio · Watchlist ·
  Settings/Data, y un `FreshnessStamp` global siempre visible.
- **Móvil:** barra inferior con 5 destinos; Settings va en el menú de perfil.

### 8.3 Overview

- Valor de la cartera, TWR y desviación frente al objetivo.
- Estado del mercado: SPY frente a la SMA200 y amplitud (porcentaje del universo por encima de la SMA200).
- Top 5 del radar.
- Alertas: posiciones debilitándose y activos de la watchlist que cambian de estado.

---

## 9. PWA, seguridad y calidad

**PWA:**

- Manifest, iconos (maskable), `display: standalone` y `theme-color`.
- Service worker con **network‑first para los datos**. Si se sirve algo de caché, se muestra la banda
  "Sin conexión — datos del {fecha}".
- No hay caché offline de los endpoints de cartera.

**Seguridad:**

- Supabase Auth (magic link o passkey) con lista de correos permitidos y RLS en todas las tablas de usuario.
- La `service_role` solo se usa en GitHub Actions y en el servidor, nunca en el cliente.
- Las rutas de mutación comprueban la sesión y validan con Zod.
- `.env.example` sin secretos.
- Los logs no incluyen importes ni credenciales.

**Tests:**

| Ámbito | Herramienta | Qué cubre |
|---|---|---|
| Motor | pytest | Retornos, ajustes por split y dividendo, SMA/ATR/drawdown/beta, valores ausentes, scores y orden, reglas de clasificación, validadores de datos, errores, 429 y respuestas incompletas del proveedor, datos obsoletos, backtest sin look‑ahead (test de "datos futuros envenenados") |
| Cartera | Vitest | FIFO, P&L, TWR, XIRR (comparados con casos de referencia), FX, importación CSV |
| Interfaz | Playwright | Flujos principales, rutas protegidas, estados vacíos y de error, capturas a 375/768/1280/1440 px |

**CI:** lint, typecheck, los tres conjuntos de tests y un build en cada push.

---

## 10. Fases (orden ajustado al repositorio vacío)

| Fase | Entregable | Criterio de "hecho" (verificado, no "compila") |
|---|---|---|
| **1. Fundaciones** | Monorepo, CI, esquema SQL y RLS, Supabase y Vercel enlazados, tokens de diseño y app shell con navegación, docs ARCHITECTURE y DATA_SOURCES | Despliegue en Vercel con login funcionando y CI en verde |
| **2. Datos** | Adaptadores de proveedores, ingesta incremental, validación, Parquet y Postgres, calendario y frescura, workflow diario y botón "Actualizar" | Una ejecución real llena el universo; el informe de cobertura y exclusiones es visible; un test simula un fallo del proveedor |
| **3. Motor de momentum** | Indicadores, 5 scores, clasificación, razones, snapshots, matriz de correlación, sensibilidad, METHODOLOGY.md | Tests de indicadores frente a valores calculados a mano; ranking real publicado con `data_asof` |
| **4. Validación** | Backtest walk‑forward, costes, regímenes y BACKTEST.md | Test anti look‑ahead en verde; resultados con limitaciones explícitas; **metodología congelada como v1** |
| **5. Radar + Research** | Radar completo, ficha, comparador, watchlist, presets de consultas y fichas de oportunidades | Uso real en escritorio y móvil; capturas de Playwright |
| **6. Portfolio** | Operaciones, importación CSV, cálculos, dashboard, objetivos e integración con el radar | XIRR y TWR coinciden con los casos de referencia; datos persistentes entre dispositivos |
| **7. Overview + LLM opcional** | Overview y redacción asistida de informes con verificación de números | Ningún número del texto ausente en el JSON (test) |
| **8. Producción + PWA** | Rendimiento, accesibilidad, PWA instalable, DEPLOY.md y README | Lighthouse PWA correcto; instalada y probada en un viewport móvil |

---

## 11. Costes previstos

| Concepto | Opción A | Opción B |
|---|---|---|
| Datos | 0 € | ~20 €/mes (EODHD All World; confirmar el precio vigente) |
| Vercel Hobby | 0 € | 0 € |
| Supabase Free | 0 € (500 MB de DB, 1 GB de storage; el job diario evita la pausa por inactividad) | 0 € |
| GitHub Actions | 0 € (los minutos gratuitos sobran para un job diario de unos 10‑20 min) | 0 € |
| LLM (opcional) | Céntimos al mes con informes bajo demanda | igual |

---

## 12. Decisiones que necesito que valides

| # | Decisión | Propuesta por defecto |
|---|---|---|
| **D1** | ¿Existe código, datos u hojas de cálculo previos en otro sitio? | Si existen, súbelos a este repo antes de la fase 1. Si no, se empieza desde cero. |
| **D2** | ¿Proveedor de datos? | **Opción B: EODHD ~20 €/mes.** Opción A si prefieres 0 €, asumiendo el backtest limitado. |
| **D3** | ¿Qué productos exactos tienes o planeas en Trade Republic? (ISIN del ETF MSCI World y del oro, p. ej. IE00B4L5Y983 / Xetra‑Gold) | Necesario para los precios en EUR y el solapamiento por holdings |
| **D4** | ¿Puedes exportar tus operaciones de Trade Republic (CSV o PDF de extractos)? Una muestra anonimizada me sirve. | Si no, entrada manual en el MVP |
| **D5** | ¿Infraestructura: Vercel + Supabase + GitHub Actions? Necesitarás crear las cuentas y yo te guiaré con las variables. | Sí |
| **D6** | ¿Nombre visible de la app? | "WarrenIA", con Orbital como lenguaje visual |
| **D7** | ¿Incluir ADRs (empresas extranjeras cotizadas en EE. UU.) en el universo de acciones? | Sí, marcados como ADR |
| **D8** | ¿Integración LLM opcional en la fase 7? | Sí, opcional y desactivada sin clave |

Cuando valides (o corrijas) estas decisiones, empiezo por la fase 1 y continúo fase a fase sin pedir aprobación
para cada decisión técnica, informando al cerrar cada una.
