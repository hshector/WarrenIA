# WarrenIA

Sistema personal de inteligencia financiera: **Momentum Radar** (screener cuantitativo de momentum, explicable y
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
| Documentación | [Metodología](docs/METHODOLOGY.md) · [Fuentes de datos](docs/DATA_SOURCES.md) · [Validación](docs/BACKTEST.md) · [Arquitectura](docs/ARCHITECTURE.md) · [**Puesta en marcha**](docs/DEPLOY.md) · [Plan](docs/PLAN.md) |

## Prueba rápida en local (datos de demostración)

```bash
python -m venv .venv && . .venv/bin/activate && pip install -e "./engine[dev]"
python -m warrenia_engine demo && python -m warrenia_engine backtest   # mercado SINTÉTICO, marcado como DEMO
cd web && npm ci && WARRENIA_LOCAL_MODE=1 npm run dev                   # http://localhost:3000
```

## Tests

```bash
cd engine && pytest -q                         # 48 tests: ajustes, indicadores, scores, reglas, proveedores, look-ahead, backtest
cd web && npm test                             # 44 tests: FIFO, TWR, XIRR, CSV, frescura, radar, formato, modo de seguridad
cd web && npm run build && npx playwright test # 49 E2E: radar, ficha, cartera, importación, responsive, PWA, móvil, modo oscuro, caso peor
```

Para ver la interfaz con datos extremos pero realistas (nombres muy largos, cifras de ocho dígitos, posiciones de
0,000123 unidades, campos vacíos), genera primero los datos de demostración y ejecuta `cd web && npm run dev:worst`.
Las mismas condiciones se comprueban en los E2E de los proyectos `worst-phone` (320 px), `worst-phone-dark` y `worst-desktop`.

Coste mensual con la configuración actual: **0 €**. Las limitaciones están documentadas en
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) y [docs/BACKTEST.md](docs/BACKTEST.md).
