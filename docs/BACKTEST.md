# Validación (backtest)

Código: [`engine/warrenia_engine/backtest.py`](../engine/warrenia_engine/backtest.py). Workflow semanal:
`.github/workflows/backtest.yml`. Resultados en la web: *Datos y ajustes → Validación*.

## Diseño

- **Señal:** se calcula al cierre de la última sesión de cada mes **completo**, con `evaluate(t)` (solo datos ≤ t).
- **Ejecución:** en la **apertura de la sesión siguiente** (t+1). Las posiciones se mantienen y derivan hasta el
  siguiente rebalanceo.
- **Costes:** 10 pb por lado sobre el nominal negociado (el turnover cuenta compras y ventas).
- **Universo point‑in‑time:** las barras *grouped daily* incluyen las empresas que después dejaron de cotizar. Si
  una posición deja de cotizar, se valora a su último precio.
- **Estrategias** (top N = 20, equiponderadas):
  - 12‑1 puro
  - Momentum Score ajustado por riesgo
  - Overall completo
  - Overall excluyendo Risk > p80 o volatilidad > 60 %
  - Solo «Candidatas» (lo que la app propone comprar: excluye las sobreextendidas)
  - Candidatas con regla de mantener (compra en el 20 % superior, vende al salir del 50 % superior o pasar a «Evitar»)
  - Equiponderado de todo el universo (referencia pasiva)
- **Benchmarks:** SPY, RSP, QQQ y MDY, en comprar y mantener.
- **Métricas:** CAGR, volatilidad, Sharpe (rf = 0), Sortino (desviación a la baja sobre todas las sesiones), Max DD, Calmar, turnover, costes, número de posiciones,
  exposición sectorial y rentabilidad por régimen (SPY por encima o debajo de la SMA200, terciles de volatilidad).
- **Sin ajuste de parámetros:** se usan los pesos de la configuración. El marco separa desarrollo, validación y
  evaluación final cuando hay al menos 8 años de historia; hasta entonces todo resultado se marca como
  **exploratorio**.

## Controles anti‑sesgo (con tests)

| Riesgo | Control |
|---|---|
| Look‑ahead | `indicators_at` lee filas ≤ t; el test «envenena» el futuro y verifica que la selección no cambia |
| Retraso señal → ejecución | Ejecución en t+1, apertura |
| Mes incompleto | Solo se rebalancea al final de meses completos (test) |
| Supervivencia | Universo construido con las barras históricas de cada día, no con la lista actual |
| Costes | Incluidos y reportados |
| Splits y dividendos | Ajuste propio con tests de continuidad y rentabilidad total |

## Limitaciones con el plan gratuito (importante)

- Hay ~2 años de historia. Tras 294 sesiones de calentamiento quedan **~12 rebalanceos**, de un único régimen de
  mercado y sin separación desarrollo/validación/test. **Los resultados no son concluyentes** y la web lo dice
  explícitamente.
- La capitalización usa las acciones en circulación **actuales**: hay un pequeño sesgo de anticipación en el filtro
  de tamaño. Lo mismo ocurre con el filtro de beneficios de las «Candidatas» (último beneficio anual publicado).
- El coste es proporcional (10 pb). La comisión fija por orden de un bróker (p. ej. 1 €) no se modela: con importes
  pequeños pesa mucho más, y por eso el Plan recomienda el ETF de momentum por debajo de 5.000 €.
- No hay impuestos ni divisa: las rentabilidades son en USD. El coste por operación es fijo y no hay impacto de
  mercado.
- El momentum tiene episodios de colapso documentados (Daniel & Moskowitz 2016), sobre todo en rebotes tras mercados
  bajistas. Una muestra corta puede no contener ninguno.

**Resultados pasados, simulados o no, no garantizan resultados futuros.**
