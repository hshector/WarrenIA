# Metodología de momentum (v1.3)

Toda la configuración vive en [`config/momentum.yaml`](../config/momentum.yaml),
[`config/universe.yaml`](../config/universe.yaml) y [`config/benchmarks.yaml`](../config/benchmarks.yaml).
Cada ejecución guarda el **hash de la configuración** (`config_hash`), de modo que cualquier ranking publicado se puede
reproducir con el mismo código, los mismos datos y la misma configuración.

> **Qué es y qué no es.** Es un *ranking cuantitativo* basado solo en precios y volumen de cierre. No es análisis
> fundamental. Un momentum alto no implica que una empresa sea barata, rentable o sólida, ni garantiza rentabilidades
> futuras.

---

## 1. Principios

1. **Point-in-time.** `indicators_at(t)` solo lee filas `≤ t`. La misma función calcula el ranking de hoy, el
   histórico de posiciones y el backtest. Hay un test que «envenena» el futuro y comprueba que las señales no cambian
   (`engine/tests/test_indicators.py::test_no_look_ahead` y `engine/tests/test_backtest.py::test_signals_have_no_look_ahead`).
2. **Precios ajustados por el motor.** Se descargan barras sin ajustar y eventos de split y dividendo, y el motor
   aplica un ajuste hacia atrás (estilo CRSP). El resultado es una serie continua de rentabilidad total, reproducible
   e independiente de cuándo se descargó cada día.
3. **Percentiles transversales.** Cada componente se convierte en un percentil (0‑100) dentro del universo elegible de
   su clase (acciones o ETFs, nunca mezclados): `(rank − 0,5) / n × 100`, con empates promediados. Los percentiles
   son robustos a colas gordas y comparables entre factores. Con ellos la winsorización no es necesaria, porque el
   rango no cambia ante transformaciones monótonas.
4. **Scores separados.** Momentum, Trend Quality, Acceleration y Risk se calculan por separado. El Overall los combina
   con pesos explícitos.
5. **Pesos a priori.** Los pesos se fijaron por la literatura y por interpretabilidad, **no** para maximizar un
   backtest. Su robustez se mide con un análisis de sensibilidad publicado en cada ejecución.

## 2. Componentes

Ventanas en sesiones bursátiles: 1m = 21, 3m = 63, 6m = 126, 12m = 252, salto = 21.

### Momentum Score (fortaleza tendencial)

| Componente | Definición | Peso | Base |
|---|---|---|---|
| `mom_12_1_riskadj` | (P[t−21] / P[t−252] − 1) / vol anualizada de 252d | 50 % | Jegadeesh & Titman (1993); salto de 1 mes por la reversión a corto plazo (Jegadeesh 1990) |
| `mom_6_1_riskadj` | (P[t−21] / P[t−126] − 1) / vol anualizada de 252d | 50 % | Índices MSCI Momentum (combinación 6m/12m ajustada por riesgo); Barroso & Santa‑Clara (2015) |

Dividir por la volatilidad evita que el ranking quede dominado por los valores más volátiles, que suben mucho por
riesgo y no por tendencia.

### Trend Quality (consistencia y limpieza)

| Componente | Definición | Peso | Base |
|---|---|---|---|
| `consistency` | % días alcistas − % días bajistas entre t−252 y t−21 | 25 % | *Frog in the pan*: Da, Gurun & Warachka (2014); Gray & Vogel. Para las ganadoras equivale a −ID. **v1.1:** ya no se multiplica por signo(R12‑1), que daba la máxima consistencia a una acción que baja de forma constante. |
| `signed_r2` | R² de la regresión log‑precio/tiempo (126d) × signo de la pendiente | 25 % | Linealidad de la tendencia |
| `ma_structure` | Número de condiciones cumplidas (0‑5): P > SMA50, P > SMA200, SMA50 > SMA200, SMA200 sube en 21d, SMA50 sube en 10d | 25 % | Filtros de tendencia (Faber 2007) |
| `high52_proximity` | P / máximo de 52 semanas | 25 % | George & Hwang (2004) |

### Acceleration Score (evolución reciente del impulso)

| Componente | Definición | Peso |
|---|---|---|
| `mom_pct_change` | Percentil de Momentum hoy menos el de hace 21 sesiones (calculado con los precios de entonces) | 50 % |
| `rs_slope_change` | Pendiente Theil‑Sen de log(P/SPY) en 21d menos la de las 63d anteriores, normalizada por la volatilidad diaria | 50 % |

**Por qué Theil‑Sen.** Es la mediana de las pendientes entre pares de puntos, así que una sesión explosiva aislada no
cambia la pendiente; para eso hace falta una aceleración sostenida. La concentración en pocas sesiones se mide además
como riesgo.

Peso bajo en el Overall (10 %): la evidencia es más débil y choca con la reversión a 1 mes.

### Risk Score (convención: 0 = menor riesgo del universo, 100 = mayor)

| Componente | Definición | Peso |
|---|---|---|
| `vol_63` | Volatilidad anualizada de 63d | 20 % |
| `maxdd_252` | Drawdown máximo de 12 meses | 20 % |
| `beta_252` | Beta frente a SPY (12 meses) | 20 % |
| `gap_freq` | Proporción de sesiones (126d) que abren con un salto > 2 × ATR14 | 20 % |
| `concentration` | Parte del movimiento absoluto de 126d explicada por las 5 mayores sesiones | 20 % |

`atr_pct` (ATR14/precio) se muestra, pero **no puntúa**: tiene una correlación de rango cercana a 0,9 con `vol_63`
y sería doble conteo. Además del percentil se muestra la volatilidad absoluta, porque «p90» en un mercado tranquilo
puede ser un riesgo moderado.

### Overall Momentum Rank

```
Overall = percentil( 0,50·Momentum + 0,25·TrendQuality + 0,10·Acceleration + 0,15·(100 − Risk) )
```

- **Momentum** domina porque es el factor con más evidencia.
- **Trend Quality** recoge efectos con evidencia propia (consistencia, máximo de 52 semanas).
- **Acceleration** pesa poco porque su evidencia es más débil.
- **Riesgo (15 %)** actúa como ajuste de calidad. Su peso es moderado porque el Momentum ya divide por la
  volatilidad.

Dentro de cada score, si falta un componente su peso se reparte entre los disponibles siempre que haya al menos el
50 % del peso. El Overall exige además el Momentum y al menos el 75 % de su peso total; si no, el activo se excluye con
el motivo «Métricas incompletas».

### Contexto (se muestra, pero no puntúa)

- **Rentabilidad relativa frente al benchmark** (SPY, RSP, QQQ, MDY, a elegir). Restar la misma referencia a todos
  los activos **no cambia el orden transversal**, así que añadirla al score sería ruido o doble conteo. Por eso el
  benchmark elegido no altera los scores.
- **Liderazgo (momentum residual).** Rentabilidad 12‑1 una vez descontada la beta al mercado, escalada por la
  volatilidad residual (Blitz, Huij & Martens 2011). Distingue al que lidera del que solo sube con el mercado.
- **Relativo al sector.** Rentabilidad de 6m frente al ETF sectorial SPDR que corresponde a su SIC.

## 3. Clasificación (reglas explícitas)

Un activo puede cumplir varias reglas (`tags`). El **estado principal** se asigna por este orden de precedencia:
Speculative › Extended › Weakening › Breakout › Strong › Improving › Neutral. La ficha muestra el detalle de cada
condición con su valor y su umbral.

| Estado | Regla (umbrales en `classification`) |
|---|---|
| **High Volatility / Speculative** | vol63 ≥ 60 %, **o** (Risk ≥ p90 **y** vol63 ≥ 40 %). Anclas absolutas para que no sea «siempre el 10 % superior». |
| **Extended / Overheated** | Momentum ≥ 70 **y** (precio > SMA50 + 3 × ATR14 **o** distancia a la SMA200 por encima de su propio percentil 95 histórico, con ≥ 252 observaciones **o** subida de 1 mes en el 5 % superior del universo y ≥ +15 %, v1.1: reversión a corto plazo, Jegadeesh 1990) |
| **Weakening Momentum** | Momentum ≥ 60 **y** al menos 2 de estas 3 señales: el percentil de Momentum cae ≥ 10 en 21 sesiones; cruce bajo la SMA50 en las últimas 5 sesiones (sigue por debajo) tras ≥ 40 sesiones por encima (v1.1: antes solo contaba el día exacto del cruce); Acceleration ≤ 25 |
| **Early Breakout** | En las últimas 10 sesiones, cierre por encima del máximo de los 126 cierres previos, con volumen ≥ 1,5 × la media de 50d y una consolidación previa (rango de 40d ≤ 8 ATR). La interfaz indica «necesita confirmación». |
| **Strong Uptrend** | Momentum ≥ 80, Trend Quality ≥ 70, P > SMA50 > SMA200 y a ≤ 10 % del máximo de 52 semanas |
| **Improving Momentum** | El percentil de Momentum sube ≥ 15 en 21 sesiones **y** Acceleration ≥ 70 |

## 3 bis. Qué hacer: la capa de acción (v1.1)

La puntuación dice «tendencia fuerte»; no dice si **comprar ahora** es sensato. Comprar lo que ha subido es la esencia
del momentum y, de media, funciona (las líderes de 6‑12 meses siguen batiendo al mercado unos meses). Lo que no está
respaldado es comprar el **pico de una subida explosiva**: el mes siguiente a una gran subida tiende a devolver parte
(reversión a corto plazo). Por eso cada activo recibe una acción con reglas fijas (`action` en `momentum.yaml`,
`scoring.decide`):

| Acción (en la app) | Regla |
|---|---|
| **Avoid** | Speculative, Weakening, Momentum < 50, precio por debajo de la SMA200, **o bandera roja fundamental** (Altman Z'' < 1,1) |
| **Wait for a dip** | Estado Extended («Ran up too fast») y Overall ≥ 60. Se indica la referencia de entrada (la SMA50) |
| **Buy candidate** | Overall ≥ 80 (20 % superior), Momentum ≥ 70, precio > SMA50 > SMA200, sin Extended/Speculative/Weakening **y sin ninguna bandera amarilla fundamental** |
| **Watch** | Overall ≥ 60 sin cumplir lo anterior (incluye las que tienen banderas amarillas) |
| **No signal** | El resto |

**Regla de mantener (buffer).** Para lo que ya tienes: *Mantener* mientras no sea «Evitar» y siga en la mitad superior
(Overall ≥ 50); si no, *Revisar venta*. Comprar en el 20 % superior y vender solo al salir del 50 % superior reduce la
rotación (y los impuestos) sin cambiar la idea de la estrategia; es la misma lógica de los *buffers* de los índices
MSCI Momentum.

**Fundamentales (v1.2).** Filtro estricto, no predictor: el momentum elige *qué sube*; los fundamentales descartan
*empresas frágiles* que suben. Datos: último informe anual US GAAP en la SEC (XBRL *frames*), emparejado con el cierre
de ejercicio de cada empresa (FY0, FY‑1, FY‑2); se ignora si tiene más de 550 días.

| Medida | Fuente académica | Uso |
|---|---|---|
| Piotroski F‑Score (9 señales) | Piotroski (2000), *JAR* | Seguridad; < 5 = bandera amarilla. Solo si se conocen las 9 |
| Altman Z'' (no manufactureras) | Altman (1968; Z'' 1995/2000) | Seguridad; < 1,1 = **bandera roja → Avoid** |
| Beneficio bruto / activos | Novy‑Marx (2013), *JFE* | Calidad |
| Devengos (BN − FCO) / activos | Sloan (1996), *TAR* | Calidad; > 10 % = bandera amarilla |
| EBIT / EV | Greenblatt (2005); Gray y Carlisle (2012) | Valor; < 1 % = bandera amarilla |
| Rentabilidad FCF y beneficio | Fama y French (1992); Asness, Frazzini y Pedersen (QMJ, 2019) | Valor |
| Emisión neta de acciones | Pontiff y Woodgate (2008), *JF* | > 5 % anual = bandera amarilla |

Otras banderas amarillas: pérdidas en el último ejercicio y flujo de caja operativo negativo. Las puntuaciones Quality,
Safety y Value son percentiles entre las acciones del radar, combinadas 40/30/30 en un «Fundamentals score» (estilo
QMJ). Pesos y umbrales en `fundamentals:` de `momentum.yaml`, fijados antes del backtest. Bancos y aseguradoras (SIC
6000‑6799): el F‑Score y el Z'' no se aplican y no se inventan. Emisores IFRS (muchos ADR): «sin datos», nunca un
suspenso. El PER sigue publicándose como dato informativo.

**Empresas extranjeras (IFRS) y ADR (v1.3).** Las empresas que presentan sus cuentas en IFRS (la mayoría de los ADR
europeos) no están en las tablas *frames* de US GAAP. Su informe anual (20‑F/40‑F) se lee del archivo *companyfacts*
de cada empresa en la SEC, con las mismas medidas (equivalencias de la taxonomía `ifrs-full` en `fundamentals.py`;
deuda corriente y no corriente separadas para no contarla dos veces). Los ratios no dependen de la moneda; los importes
se pasan a USD con los tipos de referencia del BCE. En los **ADR** no se calculan ratios de precio (PER, EV/EBIT,
rentabilidad FCF): el precio es por ADR, la SEC da acciones ordinarias y la relación ADR/acción no está en los datos,
así que el ratio podría salir varias veces equivocado. Calidad y salud financiera sí se calculan.

**Cambios de señal y avisos.** Cada cálculo compara la acción y el veredicto de mantener de cada valor con la
publicación anterior y los guarda en `published/signals.json` (120 días). `python -m warrenia_engine notify` envía un
aviso Web Push por usuario y sesión, como mucho, con lo que le afecta: valores que tiene (sobre todo «considerar
vender»), valores que sigue y nuevas candidatas (según sus preferencias). Nunca se envía dos veces la misma sesión.

**Proyección de patrimonio (página Plan).** Rentabilidades reales a largo plazo por clase de activo, con su fuente:
- **Acciones:** 4,5 %, volatilidad 16 %. DMS 1900‑2023 da 5,0 %; se rebaja por las valoraciones actuales.
- **Oro:** 1 % (Erb y Harvey 2013).
- **Materias primas:** 1 % (Levine et al. 2018).
- **Bonos a corto y liquidez:** alrededor de 0 %.
- **Bitcoin:** 0 %, con volatilidad del 60 %. No tiene flujos de caja ni historia suficiente.
- **Momentum:** sin prima extra.

Se combinan según la mezcla del plan, con correlaciones de largo plazo. Se simulan 2.000 trayectorias mensuales
log‑normales con semilla fija y se muestran los percentiles 10, 50 y 90 en euros de hoy, antes de impuestos.

**Validación.** El backtest compara «ranking completo» con «solo Candidatas» y «Candidatas con regla de mantener». La
regla de esperar es de **prudencia** y no promete más rentabilidad. En el mercado sintético de demostración resta
rentabilidad, porque ese mercado no tiene reversión a corto plazo por construcción. Con datos reales se medirá a medida
que se acumule historia.

## 4. Universo y calidad de datos

Ver [`config/universe.yaml`](../config/universe.yaml).

**Acciones:**

- Tipos CS y ADRC en NYSE, Nasdaq, NYSE American, Arca o BZX.
- Precio ≥ 5 $.
- Volumen monetario medio de 63d ≥ 20 M$.
- Capitalización estimada ≥ 2.000 M$. Si la capitalización es desconocida, se exige un volumen ≥ 100 M$/día y el
  activo queda marcado.
- Historial ≥ 273 sesiones, con un máximo del 2 % de sesiones sin datos.

**ETFs:** volumen ≥ 10 M$/día. Se excluyen los apalancados e inversos mediante una heurística por nombre documentada
(sin excluir, por ejemplo, «Short‑Term Treasury»).

**Controles de calidad:**

- **Pico que revierte** (|r| > 25 % y al día siguiente vuelve dentro de ±5 %): se trata como precio erróneo y el
  activo se excluye.
- **Movimiento > 50 % que no revierte:** solo se marca, porque puede ser una noticia real.
- **Sin cotización en la última sesión:** el precio se considera obsoleto y el activo se excluye.
- **Barras imposibles** (cierre ≤ 0 o máximo < mínimo): se descartan al ingerirlas.

**Estado de la ejecución:**

- Cada exclusión mantiene su motivo, consultable en *Datos y ajustes*.
- Si la cobertura cae por debajo del 80 % de la ejecución anterior, la ejecución se publica como **«con avisos»**.
- Si los datos no llegan a la última sesión cerrada, también se publica como «con avisos» y la interfaz lo indica.

## 5. Robustez

- **Sensibilidad.** Se toman 500 muestras Dirichlet (concentración 40) alrededor de los pesos del Overall. Se
  publican la mediana y el p5 de la correlación de Spearman frente al ranking base y el solapamiento del top‑25, con
  un objetivo declarado de antemano: solapamiento mediano ≥ 70 %. Si no se cumple, se informa; los pesos no se
  ajustan.
- **Correlación entre componentes.** Se calcula la correlación de rangos en cada ejecución y se marcan los pares con
  |ρ| ≥ 0,8. Es la señal para revisar posibles dobles conteos con datos reales. Con datos sintéticos aparecen pares
  altos por construcción del generador.

## 6. Limitaciones conocidas

- **Capitalización.** Es una estimación: acciones en circulación según la SEC × precio. Las empresas con varias
  clases de acciones reportan un total; algunos emisores extranjeros no reportan el dato.
- **Sector.** Se aproxima a partir del código SIC de la SEC y **no es GICS**.
- **Historia.** Con el plan gratuito del proveedor hay ~2 años. El ranking actual queda completo, pero el histórico
  de posiciones cubre como máximo el último año.
- **Tipo de dato.** Solo hay datos de cierre: no existe confirmación intradía de rupturas.
