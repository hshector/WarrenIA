"""Deterministic explanations and opportunity reports.

Every number in these texts comes from the computed indicators of the run; no free
text generation is involved. Language: Spanish (UI language).
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .scoring import STATES

LABELS = {
    "mom_12_1_riskadj": "Retorno 12-1m ajustado por volatilidad",
    "mom_6_1_riskadj": "Retorno 6-1m ajustado por volatilidad",
    "consistency": "Consistencia (días alcistas - bajistas, 12-1m)",
    "signed_r2": "Linealidad de la tendencia (R² 126d con signo)",
    "ma_structure": "Estructura de medias (0-5)",
    "high52_proximity": "Proximidad al máximo de 52 semanas",
    "mom_pct_change": "Cambio del percentil de Momentum (21 sesiones)",
    "rs_slope_change": "Aceleración de la fuerza relativa (21d vs 63d previas)",
    "vol_63": "Volatilidad 63d",
    "maxdd_252": "Drawdown máximo 12m",
    "beta_252": "Beta frente al benchmark (12m)",
    "gap_freq": "Frecuencia de gaps > 2 ATR (126d)",
    "concentration": "Concentración del movimiento en 5 sesiones (126d)",
    "atr_pct": "ATR14 / precio (informativo, no puntúa)",
    "residual_mom": "Liderazgo: momentum residual tras beta (informativo)",
}


def _ok(v) -> bool:
    return v is not None and isinstance(v, (int, float, np.floating, np.integer)) and math.isfinite(float(v))


def pct(v, digits: int = 1, sign: bool = True) -> str:
    if not _ok(v):
        return "n/d"
    s = f"{float(v) * 100:+.{digits}f}%" if sign else f"{float(v) * 100:.{digits}f}%"
    return s.replace(".", ",")


def num(v, digits: int = 2) -> str:
    if not _ok(v):
        return "n/d"
    return f"{float(v):.{digits}f}".replace(".", ",")


def usd_compact(v) -> str:
    if not _ok(v):
        return "n/d"
    v = float(v)
    for div, suf in ((1e12, " B$"), (1e9, " mil M$"), (1e6, " M$")):
        if abs(v) >= div:
            return f"{v / div:.1f}{suf}".replace(".", ",")
    return f"{v:,.0f} $"


def p(v) -> str:
    return "n/d" if not _ok(v) else f"p{int(round(float(v)))}"


def short_reasons(ind: pd.Series, sc: pd.Series) -> list[str]:
    """Up to 3 short drivers for the radar table."""
    out: list[str] = []
    if _ok(sc.get("momentum")) and sc["momentum"] >= 60:
        out.append(f"12-1m {pct(ind['r12_1'], 0)} con vol {pct(ind['vol_252'], 0, False)}")
    elif _ok(sc.get("momentum")) and sc["momentum"] < 40:
        out.append(f"Momentum débil ({p(sc['momentum'])})")
    if _ok(ind.get("dist_52w_high")) and ind["dist_52w_high"] <= 0.03:
        out.append("en máximos de 52 semanas" if ind["dist_52w_high"] <= 0.005 else f"a {pct(ind['dist_52w_high'], 0, False)} del máximo 52s")
    if bool(ind.get("breakout")):
        out.append(f"ruptura con volumen {num(ind['breakout_vol_mult'], 1)}x")
    if _ok(sc.get("pct_rs_slope_change")):
        if sc["pct_rs_slope_change"] >= 85:
            out.append("fuerza relativa acelerando")
        elif sc["pct_rs_slope_change"] <= 15:
            out.append("fuerza relativa frenando")
    if _ok(sc.get("risk")) and sc["risk"] >= 75:
        comps = {k: sc.get(f"pct_{k}") for k in ("vol_63", "maxdd_252", "beta_252", "gap_freq", "concentration")}
        comps = {k: v for k, v in comps.items() if _ok(v)}
        if comps:
            top = max(comps, key=comps.get)
            names = {"vol_63": "volatilidad", "maxdd_252": "drawdown", "beta_252": "beta",
                     "gap_freq": "gaps", "concentration": "movimientos concentrados"}
            out.append(f"riesgo alto por {names[top]}")
    return out[:3]


def horizon_profile(row_pcts: dict[str, float]) -> tuple[list[str], list[str]]:
    names = {"r1m": "1 mes", "r3m": "3 meses", "r6m": "6 meses", "r12m": "12 meses"}
    strong = [names[k] for k, v in row_pcts.items() if _ok(v) and v >= 70]
    weak = [names[k] for k, v in row_pcts.items() if _ok(v) and v <= 40]
    return strong, weak


def report(tk: str, name: str, cls: str, ind: pd.Series, sc: pd.Series, state: dict,
           bench: str, bench_ret: dict[str, float], horizon_pcts: dict[str, float],
           universe_label: str, quality: dict) -> dict:
    """Structured opportunity card (Thesis / Evidence / Risks / Invalidation / Data quality)."""
    st_name = STATES[state["state"]]
    fired = [c["text"] for c in state["trace"].get(state["state"], []) if c["pass"]]

    thesis = [
        f"{tk} acumula {pct(ind['r12m'])} en 12 meses ({pct(ind['r12_1'])} excluyendo el último mes) y "
        f"cotiza {pct(ind['px_vs_sma200'])} respecto a su media de 200 sesiones.",
        f"Destaca en el universo de {universe_label}: Momentum {p(sc['momentum'])}, Trend Quality "
        f"{p(sc['trend_quality'])}, Acceleration {p(sc['acceleration'])} y Risk {p(sc['risk'])} "
        f"(0 = menor riesgo).",
    ]
    if state["state"] != "neutral":
        thesis.append(f"Estado «{st_name}» porque se cumplen: " + "; ".join(fired) + ".")
    else:
        thesis.append("No cumple las reglas de ningún estado específico (Neutral).")

    def vs(h):
        b = bench_ret.get(h)
        a = ind[h]
        if not (_ok(a) and _ok(b)):
            return "n/d"
        return pct((1 + a) / (1 + b) - 1)

    evidence = [
        {"label": "Rentabilidad 1m / 3m / 6m / 12m",
         "value": " / ".join(pct(ind[h]) for h in ("r1m", "r3m", "r6m", "r12m")),
         "context": f"frente a {bench}: " + " / ".join(vs(h) for h in ("r1m", "r3m", "r6m", "r12m"))},
        {"label": "Momentum 12-1m ajustado por riesgo", "value": num(ind["mom_12_1_riskadj"]),
         "context": f"{pct(ind['r12_1'])} / vol 12m {pct(ind['vol_252'], 1, False)}"},
        {"label": "Liderazgo (momentum residual tras beta)", "value": num(ind["residual_mom"]),
         "context": "positivo = sube más de lo que explica su beta al mercado"},
        {"label": "Tendencia", "value": f"{int(ind['ma_structure']) if _ok(ind['ma_structure']) else 'n/d'}/5 condiciones de medias",
         "context": f"R² 126d {num(ind['r2_126'])}, {pct(ind['pct_up_days'], 0, False)} de días alcistas"},
        {"label": "Máximo de 52 semanas", "value": f"a {pct(ind['dist_52w_high'], 1, False)}",
         "context": "nuevo máximo" if bool(ind["new_52w_high"]) else ""},
        {"label": "Volumen relativo (5d / 50d)", "value": f"{num(ind['rel_volume'], 2)}x",
         "context": f"volumen monetario medio 63d {usd_compact(ind['adv_63'])}"},
        {"label": "Volatilidad 63d / ATR14", "value": f"{pct(ind['vol_63'], 1, False)} / {pct(ind['atr_pct'], 1, False)}",
         "context": f"beta {num(ind['beta_252'])}"},
        {"label": "Drawdown máx. 12m / actual", "value": f"{pct(ind['maxdd_252'], 1, False)} / {pct(ind['dd_now'], 1, False)}",
         "context": ""},
    ]
    strong_h, weak_h = horizon_profile(horizon_pcts)
    if strong_h:
        evidence.append({"label": "Horizontes donde destaca (≥ p70)", "value": ", ".join(strong_h), "context": ""})
    if weak_h:
        evidence.append({"label": "Horizontes donde no destaca (≤ p40)", "value": ", ".join(weak_h), "context": ""})

    risks: list[str] = []
    if "extended" in state["tags"]:
        risks.append(f"Precio extendido: {num(ind['atr_above_sma50'], 1)} ATR sobre la SMA50; "
                     f"distancia a SMA200 {pct(ind['dist200'])} (percentil 95 propio: {pct(ind['dist200_own_q'])}).")
    if _ok(ind["vol_63"]) and ind["vol_63"] > 0.45:
        risks.append(f"Volatilidad elevada: {pct(ind['vol_63'], 0, False)} anualizada en 63 sesiones.")
    if _ok(sc.get("pct_gap_freq")) and sc["pct_gap_freq"] >= 75:
        risks.append(f"Gaps frecuentes: {pct(ind['gap_freq'], 0, False)} de las sesiones abren con un salto > 2 ATR.")
    if _ok(ind["concentration"]) and ind["concentration"] >= 0.35:
        risks.append(f"Movimiento concentrado: las 5 mayores sesiones explican {pct(ind['concentration'], 0, False)} "
                     "del movimiento absoluto de 6 meses.")
    if _ok(ind["beta_252"]) and ind["beta_252"] >= 1.5:
        risks.append(f"Alta sensibilidad al mercado (beta {num(ind['beta_252'])}).")
    if _ok(ind["dd_now"]) and ind["dd_now"] >= 0.10:
        risks.append(f"Ya cede {pct(ind['dd_now'], 0, False)} desde su máximo de 12 meses.")
    if "weakening" in state["tags"]:
        risks.append("Señales de deterioro del impulso: " + "; ".join(
            c["text"] for c in state["trace"]["weakening"][1:] if c["pass"]) + ".")
    if _ok(sc.get("mom_pct_change")) and sc["mom_pct_change"] <= -10 and "weakening" not in state["tags"]:
        risks.append(f"El percentil de Momentum ha caído {num(-sc['mom_pct_change'], 0)} puntos en 21 sesiones.")
    if not risks:
        risks.append("Sin alertas de riesgo específicas según las reglas actuales; el riesgo general del momentum "
                     "(reversiones bruscas tras caídas del mercado) sigue aplicando.")

    invalidation = [
        f"Cierre por debajo de la SMA50 (hoy {num(ind['sma50'])}, el precio está {pct(ind['px_vs_sma50'])} respecto a ella).",
        f"Momentum Score por debajo de p50 (hoy {p(sc['momentum'])}).",
        f"Pérdida de la estructura alcista: SMA50 por debajo de la SMA200 (hoy SMA50 {num(ind['sma50'])} vs SMA200 {num(ind['sma200'])}).",
        f"Fuerza relativa frente a {bench} con pendiente negativa sostenida (variación robusta de la RS en 21 sesiones hoy: {pct(np.expm1(ind['rs_slope_21']))}).",
    ]
    if bool(ind["breakout"]):
        invalidation.insert(0, "Regreso por debajo del máximo previo de 126 sesiones que se ha superado: la ruptura no se confirmaría.")

    return {
        "ticker": tk, "name": name, "cls": cls, "state": state["state"], "state_label": st_name,
        "thesis": thesis, "evidence": evidence, "risks": risks, "invalidation": invalidation,
        "data_quality": quality,
        "disclaimer": "Ranking cuantitativo basado solo en precios y volumen. No es análisis fundamental ni "
                      "una recomendación; el momentum pasado no garantiza rentabilidades futuras.",
    }
