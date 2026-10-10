# Arquitectura

```
 Massive (EOD EE. UU.) ─┐
 SEC EDGAR ─────────────┤      GitHub Actions (cron 05:15 UTC + manual + botón web)
 BCE (FX) ──────────────┤      engine/ (Python)
 EODHD (EUR, opcional) ─┘      ingest → validate → lake → panels/ajustes → indicadores → scores
                                → clasificación → informes → publish
                                          │
                                          ▼
                        Supabase Storage (bucket privado `market`)
                          lake/bars/YYYY-MM.parquet · lake/ref/*.parquet · lake/snapshots/*.parquet
                          published/latest.json → runs/<run_id>/{meta,market}.json, radar.json.gz,
                                                  excluded.json.gz, assets/<A-Z>.json.gz
                          published/backtest/latest.json · fx/ecb.json · prices/<SYMBOL>.json
                                          │  (solo servidor, secret key)
                                          ▼
                        Vercel — web/ (Next.js 16, App Router, TypeScript)
                          Server Components leen artefactos ya calculados (memo por run inmutable)
                          lib/portfolio (FIFO, TWR, XIRR, objetivos) — TypeScript puro y testeado
                          Supabase Auth (enlace mágico) + Postgres con RLS (instrumentos, operaciones,
                          watchlist, ajustes)
                          proxy.ts (control de acceso) · Server Actions validadas con Zod
                          PWA: manifest + service worker sin caché de datos
```

## Decisiones

| Decisión | Motivo |
|---|---|
| **Mercado en Python, cartera en TypeScript** | El ranking es un cálculo vectorizado sobre miles de activos y años de datos (pandas/numpy, calendarios). La cartera debe recalcularse al instante al registrar una operación. Un lenguaje por dominio evita duplicar lógica. |
| **GitHub Actions como ejecutor** | Gratis, jobs de hasta 6 h (la descarga inicial dura ~2 h), cron y `workflow_dispatch`. Vercel Hobby solo permite un cron diario y funciones cortas. |
| **Artefactos versionados en lugar de tablas de mercado** | Cada ejecución publica ficheros inmutables (`runs/<run_id>`), y `latest.json` se escribe al final, así que nadie ve una ejecución a medias. Son reproducibles (llevan `config_hash`, `git_sha` y la fecha de los datos) y caben en el plan Free (~4‑30 MB por ejecución; se guardan las 7 últimas). |
| **Postgres solo para datos del usuario** | Instrumentos, operaciones, watchlist y ajustes, con RLS por `auth.uid()`. |
| **Datos de mercado privados** | Bucket privado, leído solo por el servidor. Las condiciones de los proveedores prohíben redistribuir, y por eso toda la app requiere login. |
| **Fail closed** | Sin Supabase en Vercel, la app no muestra nada (`/setup`). Con la lista de correos vacía, no entra nadie. El modo local sin login nunca funciona en Vercel (tests en `lib/supabase/env.test.ts`). |

## Módulos principales

| Ruta | Responsabilidad |
|---|---|
| `engine/warrenia_engine/providers/` | Adaptadores: `massive.py`, `sec.py`, `synthetic.py` (DEMO) |
| `engine/warrenia_engine/http.py` | Reintentos, backoff, límite de peticiones; las URLs se registran sin query (sin claves) |
| `engine/warrenia_engine/lake.py` | Lake Parquet mensual, eventos y estado de la ingesta incremental |
| `engine/warrenia_engine/panels.py` | Paneles fecha × ticker y ajustes por splits y dividendos |
| `engine/warrenia_engine/indicators.py` | Indicadores point‑in‑time |
| `engine/warrenia_engine/scoring.py` | Percentiles, scores, Overall y reglas de clasificación |
| `engine/warrenia_engine/compute.py` | Elegibilidad → scores → estados, histórico de rangos, sensibilidad y correlaciones |
| `engine/warrenia_engine/explain.py` | Razones e informes deterministas |
| `engine/warrenia_engine/publish.py` | Artefactos, retención y puntero `latest` |
| `engine/warrenia_engine/backtest.py` | Backtest walk‑forward |
| `engine/warrenia_engine/portfolio_prices.py` | Tipos de cambio del BCE y precios en EUR (EODHD) |
| `web/lib/market/` | Tipos, lectura de artefactos, frescura y consultas del radar |
| `web/lib/portfolio/` | Contabilidad de cartera, CSV, precios sin ajustar y relevancia |
| `web/lib/user/store.ts` | Persistencia: Supabase (RLS) o fichero local (desarrollo) |
| `web/components/` | Sistema de diseño (`ui/`, `fin/`, `charts/`) y pantallas |
| `web/app/` | Rutas: Overview, Radar, Research, Portfolio, Watchlist, Settings, login |

## Seguridad

- **Claves:** solo en variables de entorno. La secret key de Supabase y el token de GitHub nunca llegan al
  navegador.
- **Mutaciones:** Server Actions con validación Zod y comprobación de sesión (`requireStore`).
  - Las ventas que dejarían posiciones negativas se rechazan reproduciendo el libro de operaciones.
  - Las importaciones se vuelven a validar en el servidor; la vista previa del cliente no se toma como válida.
- **Cabeceras:** `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` y `Permissions-Policy`.
- **Logs:** no se registran importes ni credenciales. Las URLs de los proveedores se registran sin la query.
