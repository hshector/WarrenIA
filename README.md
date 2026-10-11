# WarrenIA

Sistema personal de inteligencia financiera: **Plan** (qué comprar cada mes: ETF global, oro y momentum, con fiscalidad española), **Momentum Radar** (screener cuantitativo de momentum, explicable y
reproducible) y **Portfolio** (cartera con FIFO, TWR, TIR y desviación frente a objetivos). Es una web Next.js
desplegable en Vercel e instalable como PWA.

> Herramienta de análisis y apoyo a decisiones. **No ejecuta operaciones**, no se conecta a ningún bróker y no
> presenta predicciones como certezas. Toda cifra procede de un dato verificable o de un cálculo reproducible.

| | |
|---|---|
| Motor de datos y momentum | `engine/` (Python 3.11+) · ejecución diaria en GitHub Actions |
| Web | `web/` (Next.js 16 + TypeScript + Tailwind 4) · Vercel |
| Persistencia | Supabase: Postgres con RLS, Auth por enlace mágico y Storage privado |
| Configuración de la metodología | `config/*.yaml` |
| Documentación | [Metodología](docs/METHODOLOGY.md) · [Auditoría](docs/AUDITORIA.md) · [Fuentes de datos](docs/DATA_SOURCES.md) · [Validación](docs/BACKTEST.md) · [Arquitectura](docs/ARCHITECTURE.md) · [**Puesta en marcha**](docs/DEPLOY.md) · [Plan](docs/PLAN.md) |

## Prueba rápida en local (datos de demostración)

```bash
python -m venv .venv && . .venv/bin/activate && pip install -e "./engine[dev]"
python -m warrenia_engine demo && python -m warrenia_engine backtest   # mercado SINTÉTICO, marcado como DEMO
cd web && npm ci && WARRENIA_LOCAL_MODE=1 npm run dev                   # http://localhost:3000
```

## Tests

```bash
cd engine && pytest -q                         # 69 tests: ajustes, indicadores, scores, reglas, señal de acción, proveedores, look-ahead, backtest
cd web && npm test                             # 54 tests: FIFO, TWR, XIRR, fiscalidad, CSV, frescura, radar, catálogo, seguridad
cd web && npm run build && npx playwright test # 25 E2E: plan, radar, ficha, cartera, importación, responsive, PWA
```

Coste mensual con la configuración actual: **0 €**. Las limitaciones están documentadas en
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) y [docs/BACKTEST.md](docs/BACKTEST.md).
