# Auditoría de la matemática y del uso (octubre 2026)

Revisión completa del motor de momentum, del backtest, de la cartera y de la forma en que la app presenta sus
conclusiones. El objetivo era doble: que cada cálculo sea correcto y que la app diga con claridad **qué comprar**.

## 1. Cómo se ha verificado

- **Recálculo independiente.** Para 40 acciones de la demo se recalcularon con pandas, sin usar el código del motor,
  los indicadores que puntúan: retornos 12‑1 y 6‑1, volatilidad 252/63d, momentum ajustado por riesgo, consistencia,
  R² y pendiente de 126d, SMA50/200, estructura de medias, beta, drawdown máximo, concentración y proximidad al máximo
  de 52 semanas. Resultado: **0 diferencias**. También coincide la composición del Momentum Score.
- **Tests.** 69 en el motor, 54 en la web y 25 E2E. Los nuevos fijan cada corrección (ver abajo).
- **Datos de productos y fiscalidad.** Comprobados en fuentes externas a fecha 11‑10‑2026. Las fuentes están en
  `web/lib/plan/catalog.ts`. Un test valida el dígito de control de cada ISIN.

## 2. Errores encontrados y corregidos

| # | Dónde | Problema | Corrección |
|---|---|---|---|
| 1 | `indicators.py` · `consistency` | Se multiplicaba por el signo de la rentabilidad 12‑1. Una acción que **baja** de forma constante obtenía la consistencia máxima y subía su Trend Quality | `% días alcistas − % días bajistas`. Es igual que antes para las ganadoras y penaliza a las perdedoras |
| 2 | `indicators.py` · cruce bajo la SMA50 | Solo se detectaba el día exacto del cruce: al día siguiente la señal de «perdiendo fuerza» desaparecía | Cruce en las últimas 5 sesiones, siempre que siga por debajo |
| 3 | `backtest.py` · Sortino | Usaba la desviación típica de los días negativos. No es la desviación a la baja | `sqrt(media(min(r,0)²))` sobre todas las sesiones |
| 4 | `METHODOLOGY.md` | Decía que el Overall exige el 50 % del peso; el código exige el 75 % y el Momentum | Documentación corregida |
| 5 | Radar e Inicio | «Lo más fuerte hoy» y «Top» mostraban como primeras opciones acciones en estado *Sobreextendida* (8 de las 25 primeras en la demo), sin decir que no conviene comprarlas ahora | Nueva capa de acción (ver 3) |
| 6 | Pestaña ETFs | Mostraba ETFs de EE. UU. (SPY, QQQ…) que un particular en España **no puede comprar** (PRIIPs) | Aviso explícito y enlace a los equivalentes UCITS del Plan |

## 3. «¿Comprar lo que más ha subido no es comprar caro?»

La pregunta está bien planteada. Esta es la respuesta, que ahora también refleja la app:

- **El momentum consiste en comprar lo que ha subido.** La evidencia de décadas (Jegadeesh & Titman 1993, y estudios
  posteriores en muchos mercados) muestra que, de media, las líderes de 6‑12 meses siguen batiendo al mercado unos
  meses más. Que una acción haya subido no la hace cara: «caro» es una cuestión de valoración, no de trayectoria.
- **El riesgo real es comprar el pico de una subida explosiva.** Las mayores subidas del último mes tienden a devolver
  parte (reversión a corto plazo: Jegadeesh 1990, Lehmann 1990). Por eso la puntuación ya ignoraba el último mes.
  Ahora, además:
  - el estado *Sobreextendida* también salta con una subida de 1 mes en el 5 % superior del universo y de al menos
    un +15 %;
  - cada activo tiene una **acción**: Candidata · Esperar retroceso · Vigilar · Evitar;
  - el radar abre por defecto en **«Para comprar»** (solo Candidatas).
- **Valoración.** Se publica el PER sobre el último beneficio anual (SEC) y las empresas con pérdidas no pueden ser
  Candidatas. Es un control de cordura, no un análisis de valoración.
- **Honestidad sobre la evidencia.** «Esperar retroceso» es una regla de prudencia, no una fuente demostrada de
  rentabilidad. El backtest compara las tres variantes: ranking completo, solo Candidatas y Candidatas con regla de
  mantener. Con datos sintéticos esperar resta rentabilidad, pero ese mercado no tiene reversión a corto plazo por
  construcción, así que la comparación no significa nada. Con datos reales se medirá según se acumule historia, y la
  página de Validación lo muestra lado a lado.

## 4. Qué comprar (página Plan)

| Bloque | Producto recomendado | ISIN | Coste | Por qué |
|---|---|---|---|---|
| Núcleo 75 % | Vanguard FTSE All‑World (Acc) | IE00BK5BQT80 | 0,14 % | Mundo completo, incluidos emergentes; más barato que el MSCI World tras la rebaja de jul‑2026; acumulación |
| Oro 10 % | iShares Physical Gold ETC (equivalente: Invesco, IE00B579F325) | IE00B4ND3602 | 0,12 % | Respaldo físico, coste mínimo. La exención de Xetra‑Gold es alemana y no aplica en España |
| Momentum 15 % | iShares Edge MSCI World Momentum (con menos de 5.000 € en el bloque) | IE00BP3QZ825 | 0,25 % | Con importes pequeños, 10 acciones y 1 € por orden se comen la ventaja; el ETF rota dentro del fondo sin que tú tributes |
| Momentum 15 % | Candidatas del radar, hasta 10 a partes iguales (desde 5.000 €) | — | — | Compra solo Candidatas; vende con «Revisar venta» |

**Fiscalidad en España.**

- La base del ahorro tributa al 19/21/23/27/30 %.
- ETFs y acciones generan ganancia patrimonial al vender (FIFO).
- Los **ETC de oro** generan rendimiento del capital mobiliario (DGT V0267‑25).
- Regla de recompra: 2 meses para valores de mercados de la UE y, habitualmente, 1 año para acciones que solo cotizan
  en EE. UU.
- Los dividendos de EE. UU. soportan una retención del 15 % allí.
- Modelo 720 a partir de 50.000 €.

La cartera calcula ahora las ganancias por año y por tipo, y avisa de las pérdidas no computables por recompra.

## 4 bis. Fase 2: fundamentales, productos a elegir y app en inglés

- **Fundamentales estrictos** (ver METHODOLOGY §3 bis): F‑Score, Altman Z'', rentabilidad bruta, devengos, EBIT/EV, FCF,
  dilución. Z'' < 1,1 → *Avoid*; cualquier bandera amarilla impide *Buy candidate*. Comprobado a mano con un ejercicio
  que cierra en junio (`tests/test_fundamentals.py`). Los bancos no reciben F‑Score ni Z'' inventados.
- **Diversificadores** (antes «oro»): oro físico, bonos euro 1‑3 años, materias primas, plata y bitcoin, cada uno con su
  comportamiento medido (volatilidad, peor caída, correlación con la bolsa, qué hizo en los meses en que la bolsa cayó)
  sobre fondos estadounidenses equivalentes. Fiscalidad: los ETC/ETP tributan como rendimiento del capital mobiliario
  (DGT V0267‑25), no como ganancia patrimonial.
- **Núcleo**: tres preguntas (emergentes, pequeñas, traspaso sin impuestos) → VWCE, SPYI, XDWD o el fondo indexado de
  Fidelity. Se muestra qué hay dentro (número de empresas, peso de EE. UU., 10 mayores).
- **Qué es cada activo**: descripción de la empresa (Massive, caché de 120 días) o texto del ETF.
- **Limitación**: las comprobaciones usan US GAAP; las empresas IFRS quedan «sin datos». El parser de la SEC solo está
  probado con respuestas simuladas, porque el entorno de desarrollo no llega a sec.gov: la primera ejecución real es la
  prueba.

## 5. Lo que queda fuera (limitaciones conocidas)

- Con el plan gratuito hay ~2 años de datos: el backtest sigue sin ser concluyente.
- El PER usa el último ejercicio anual, no los últimos 12 meses. Es informativo.
- La regla de recompra se detecta por instrumento. No cubre otros casos de valores homogéneos (p. ej. dos clases de
  la misma acción).
- Las comisiones y la disponibilidad de los productos cambian: la app muestra la fecha de verificación y pide revisar
  el KID antes de comprar.
- WarrenIA es una herramienta de análisis, no un asesor financiero ni fiscal.
