# Fuentes de datos

Configuración actual: **coste 0 €/mes**, elegida en la validación del plan. Los precios y límites de los proveedores
proceden de sus webs y de fuentes de terceros consultadas en octubre de 2026; **confírmalos al darte de alta**, porque
cambian con frecuencia.

| Necesidad | Fuente | Acceso | Límites relevantes | Notas |
|---|---|---|---|---|
| Barras diarias EE. UU. (acciones y ETFs) | **Massive** (antes Polygon.io), plan Basic | API key gratuita | 5 peticiones/min, fin de día, ~2 años de historia | El endpoint *grouped daily* devuelve todo el mercado de una sesión en 1 llamada. Se piden barras **sin ajustar**. |
| Splits y dividendos | Massive `/v3/reference/splits` y `/v3/reference/dividends` | igual | Paginado (1.000 por página) | Si el plan no los incluye, la ejecución lo indica y las rentabilidades pasan a ser de precio (sin dividendos). |
| Universo (tipos, nombres, bolsa) | Massive `/v3/reference/tickers` | igual | ~30 páginas por semana | Incluye tickers inactivos, para no perder empresas que dejan de cotizar en la historia. |
| Capitalización y sector | **SEC EDGAR** (oficial) | Gratuito; `User-Agent` con e-mail obligatorio | 10 peticiones/s | XBRL *frames* `dei:EntityCommonStockSharesOutstanding` (una llamada por trimestre para todas las empresas) y SIC desde `submissions` (en caché). |
| Tipos de cambio | **BCE**, tipos de referencia del euro (oficiales) | Gratuito | Diario, ~16:00 CET | Para valorar en EUR. |
| Precios en EUR de ETF/ETC (Xetra) | **EODHD**, plan gratuito | API key gratuita | ~20 llamadas/día, ~1 año de historia | 1 llamada por instrumento y día. El histórico se acumula en el almacenamiento. Se usa el cierre **sin ajustar**, porque las distribuciones se registran como operaciones. |
| Benchmarks y sectores | Massive (SPY, RSP, QQQ, MDY y ETFs SPDR sectoriales) | igual | — | Decisión documentada en `config/benchmarks.yaml`. |

## Descartadas o como respaldo

- **Yahoo Finance / yfinance.** No es una API oficial y sus condiciones restringen el uso. Desde 2025 da con
  frecuencia errores 429 y bloqueos de IP, sobre todo desde IPs de centros de datos como GitHub Actions. No se usa.
- **Tiingo.** Buena calidad, pero el plan gratuito permite solo 500 símbolos al mes, lo que no basta para el
  universo.
- **Alpha Vantage.** 25 llamadas/día en el plan gratuito: insuficiente.
- **Stooq.** Sin API documentada ni condiciones claras.

## Cuándo pagar (siguiente iteración)

Un backtest riguroso necesita más de 2 años de historia con empresas que ya no cotizan:

- **EODHD All World** (~20 €/mes): décadas de historia, deslistados y Xetra.
- **Massive Starter**: 5 años de historia.

El motor usa adaptadores (`engine/warrenia_engine/providers/`), así que cambiar de proveedor es una pieza
intercambiable que no afecta al resto del pipeline.

## Frescura y frecuencia

**Proceso programado** (`.github/workflows/market-data.yml`):

- Se ejecuta de martes a sábado a las 05:15 UTC (pasada la medianoche de Nueva York), con un reintento a las 11:05 UTC.
- **Primera ejecución:** descarga ~540 sesiones a 5/min, unas **2 horas** en total. Si se corta, la siguiente
  ejecución continúa donde quedó (descarga incremental, de la más reciente a la más antigua).
- **Ejecuciones diarias:** de 1 a 3 llamadas de barras, eventos con 10 días de solapamiento, referencias semanales
  y SEC semanal.
- **Sesiones vacías** (el proveedor aún no ha publicado): no se marcan como descargadas y se reintentan en la
  siguiente ejecución.

**Botón «Actualizar» de la web:** lanza el mismo workflow (`workflow_dispatch`), con un enfriamiento de 15 minutos.
Con datos de cierre, solo cambia algo después de un nuevo cierre.

**Frescura en la interfaz:**

- La web muestra siempre la **fecha de la sesión de los datos** y la hora de cálculo, nunca la hora en que se abrió
  la página.
- La frescura se evalúa **al visualizar**, con el calendario NYSE publicado por el motor (`exchange_calendars`):
  - *pendiente*: hay un nuevo cierre aún en el margen de publicación.
  - *desactualizado*: hay sesiones vencidas sin procesar. Aparece una banda de aviso.
- **La PWA nunca sirve datos desde caché:** sin conexión muestra una página explícita.

**Aviso sobre GitHub Actions:** GitHub desactiva los cron de los repositorios sin actividad durante 60 días. Si
ocurre, la web mostrará los datos como desactualizados; se reactivan desde la pestaña *Actions* (o con «Actualizar»).
