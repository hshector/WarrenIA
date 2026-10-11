"""Cross-sectional scores (0-100 percentiles), overall rank and rule-based states."""

from __future__ import annotations

import numpy as np
import pandas as pd

SCORE_KEYS = ["momentum", "trend_quality", "acceleration", "risk"]

STATES = {
    "speculative": "High Volatility / Speculative",
    "extended": "Extended / Overheated",
    "weakening": "Weakening Momentum",
    "breakout": "Early Breakout",
    "strong": "Strong Uptrend",
    "improving": "Improving Momentum",
    "neutral": "Neutral",
}
STATE_ORDER = ["speculative", "extended", "weakening", "breakout", "strong", "improving"]

ACTIONS = {
    "candidate": "Candidata",
    "wait": "Esperar retroceso",
    "watch": "Vigilar",
    "avoid": "Evitar",
    "none": "Sin señal",
}


def pct_rank(x: pd.Series) -> pd.Series:
    """Percentile in (0, 100): (rank - 0.5) / n * 100, ties averaged, NaN kept."""
    valid = x.notna() & np.isfinite(x.astype(float))
    out = pd.Series(np.nan, index=x.index)
    n = int(valid.sum())
    if n == 0:
        return out
    r = x[valid].rank(method="average")
    out[valid] = (r - 0.5) / n * 100.0
    return out


def composite(components: pd.DataFrame, weights: dict[str, float], min_weight: float) -> pd.Series:
    """Weighted mean of available component percentiles, re-ranked to a percentile."""
    w = pd.Series(weights)
    pcts = components[list(w.index)]
    avail = pcts.notna().astype(float).mul(w, axis=1)
    wsum = avail.sum(axis=1)
    raw = pcts.fillna(0.0).mul(w, axis=1).sum(axis=1) / wsum.replace(0, np.nan)
    raw[wsum < min_weight - 1e-9] = np.nan
    return pct_rank(raw)


def component_percentiles(ind: pd.DataFrame, cfg_scores: dict) -> pd.DataFrame:
    keys = sorted({k for comps in cfg_scores.values() for k in comps} - {"mom_pct_change"})
    return pd.DataFrame({k: pct_rank(ind[k]) for k in keys}, index=ind.index)


def score_universe(ind: pd.DataFrame, mom_cfg: dict, prev_ind: pd.DataFrame | None = None,
                   weights_override: dict | None = None) -> pd.DataFrame:
    """Score one asset class. `ind` holds indicators of ELIGIBLE assets only.

    prev_ind: indicators of the same assets `accel_lookback` sessions earlier, used for
    the Momentum-percentile change (Acceleration).
    """
    sc = mom_cfg["scores"]
    minw = mom_cfg["min_component_weight"]
    comp = component_percentiles(ind, sc)
    out = pd.DataFrame(index=ind.index)
    out["momentum"] = composite(comp, sc["momentum"], minw)

    if prev_ind is not None and len(prev_ind):
        pc = component_percentiles(prev_ind.reindex(ind.index), {"momentum": sc["momentum"]})
        prev_m = composite(pc, sc["momentum"], minw)
        comp["mom_pct_change"] = out["momentum"] - prev_m
        out["momentum_prev"] = prev_m
    else:
        comp["mom_pct_change"] = np.nan
        out["momentum_prev"] = np.nan
    comp["mom_pct_change_pct"] = pct_rank(comp["mom_pct_change"])

    tq = composite(comp, sc["trend_quality"], minw)
    acc_comp = comp.rename(columns={"mom_pct_change": "_raw_change", "mom_pct_change_pct": "mom_pct_change"})
    acc = composite(acc_comp, sc["acceleration"], minw)
    risk = composite(comp, sc["risk"], minw)
    out["trend_quality"], out["acceleration"], out["risk"] = tq, acc, risk
    out["mom_pct_change"] = comp["mom_pct_change"]
    out["r1m_pct"] = pct_rank(ind["r1m"])  # short-term spike check (Extended)

    ow = weights_override or mom_cfg["overall"]
    out["overall"] = overall(out, ow)
    out["rank"] = rank_order(out)
    return out.join(comp.add_prefix("pct_"))


def overall(scores: pd.DataFrame, ow: dict) -> pd.Series:
    parts = pd.DataFrame({
        "momentum": scores["momentum"],
        "trend_quality": scores["trend_quality"],
        "acceleration": scores["acceleration"],
        "inverse_risk": 100.0 - scores["risk"],
    })
    w = pd.Series(ow)
    avail = parts.notna().astype(float).mul(w, axis=1).sum(axis=1)
    raw = parts.fillna(0).mul(w, axis=1).sum(axis=1) / avail.replace(0, np.nan)
    # Momentum itself is mandatory for an overall score.
    raw[scores["momentum"].isna() | (avail < 0.75)] = np.nan
    return pct_rank(raw)


def rank_order(scores: pd.DataFrame) -> pd.Series:
    df = scores[["overall", "momentum"]].copy()
    df["_t"] = df.index
    ok = df["overall"].notna()
    ordered = df[ok].sort_values(["overall", "momentum", "_t"], ascending=[False, False, True])
    rank = pd.Series(np.nan, index=df.index)
    rank[ordered.index] = np.arange(1, len(ordered) + 1)
    return rank


# ------------------------------------------------------------------ states

def classify(ind: pd.Series, sc: pd.Series, cfg: dict) -> dict:
    """Explicit rule evaluation. Returns primary state, all tags and the rule trace."""
    c = cfg["classification"]
    f = lambda v: float(v) if v is not None and np.isfinite(v) else np.nan  # noqa: E731
    mom, tq, acc, risk = f(sc["momentum"]), f(sc["trend_quality"]), f(sc["acceleration"]), f(sc["risk"])
    dmom = f(sc.get("mom_pct_change", np.nan))
    trace: dict[str, list[dict]] = {}

    def cond(text, value, op, thr):
        v = f(value)
        ok = bool(np.isfinite(v) and (v >= thr if op == ">=" else v <= thr if op == "<=" else v > thr if op == ">" else v < thr))
        return {"text": text, "value": None if not np.isfinite(v) else round(v, 4), "op": op, "threshold": thr, "pass": ok}

    def boolc(text, value):
        return {"text": text, "value": bool(value), "op": "==", "threshold": True, "pass": bool(value)}

    sp = c["speculative"]
    t_sp = [cond("Volatilidad 63d anualizada", ind["vol_63"], ">=", sp["abs_vol_63"]),
            cond("Risk Score", risk, ">=", sp["min_risk"]),
            cond("Volatilidad 63d anualizada (con Risk alto)", ind["vol_63"], ">=", sp["min_vol_63_with_risk"])]
    trace["speculative"] = t_sp
    spec = t_sp[0]["pass"] or (t_sp[1]["pass"] and t_sp[2]["pass"])

    ex = c["extended"]
    t_ext = [cond("Momentum Score", mom, ">=", ex["min_momentum"]),
             cond("ATRs sobre la SMA50", ind["atr_above_sma50"], ">", ex["atr_above_sma50"]),
             cond("Distancia a SMA200 menos su percentil 95 histórico", f(ind["dist200"]) - f(ind["dist200_own_q"]), ">", 0.0),
             cond("Subida de 1 mes: percentil en el universo", sc.get("r1m_pct", np.nan), ">=", ex["spike_r1m_pct"]),
             cond("Subida de 1 mes", ind.get("r1m", np.nan), ">=", ex["spike_r1m_min"])]
    trace["extended"] = t_ext
    spike = t_ext[3]["pass"] and t_ext[4]["pass"]
    extended = t_ext[0]["pass"] and (t_ext[1]["pass"] or t_ext[2]["pass"] or spike)

    wk = c["weakening"]
    t_wk = [cond("Momentum Score", mom, ">=", wk["min_momentum"]),
            cond("Cambio del percentil de Momentum en 21 sesiones", dmom, "<=", -wk["mom_pct_drop"]),
            boolc(f"Cruce bajo la SMA50 tras >= {wk['sma50_days_above']} sesiones por encima", ind["sma50_cross_down"]),
            cond("Acceleration Score", acc, "<=", wk["max_acceleration"])]
    trace["weakening"] = t_wk
    weakening = t_wk[0]["pass"] and sum(x["pass"] for x in t_wk[1:]) >= wk["min_signals"]

    t_bo = [boolc(f"Cierre sobre el máximo previo de {c['breakout']['lookback_high']}d en las últimas "
                  f"{c['breakout']['recent_sessions']} sesiones, con volumen >= {c['breakout']['volume_multiple']}x "
                  f"y consolidación previa", ind["breakout"])]
    trace["breakout"] = t_bo
    breakout = t_bo[0]["pass"]

    st = c["strong"]
    t_st = [cond("Momentum Score", mom, ">=", st["min_momentum"]),
            cond("Trend Quality", tq, ">=", st["min_trend_quality"]),
            boolc("Precio > SMA50 > SMA200", f(ind["price"]) > 0 and f(ind["px_vs_sma50"]) > 0 and f(ind["sma50"]) > f(ind["sma200"])),
            cond("Distancia al máximo de 52 semanas", ind["dist_52w_high"], "<=", st["max_dist_52w_high"])]
    trace["strong"] = t_st
    strong = all(x["pass"] for x in t_st)

    im = c["improving"]
    t_im = [cond("Cambio del percentil de Momentum en 21 sesiones", dmom, ">=", im["mom_pct_rise"]),
            cond("Acceleration Score", acc, ">=", im["min_acceleration"])]
    trace["improving"] = t_im
    improving = all(x["pass"] for x in t_im)

    flags = {"speculative": spec, "extended": extended, "weakening": weakening,
             "breakout": breakout, "strong": strong, "improving": improving}
    tags = [k for k in STATE_ORDER if flags[k]]
    state = tags[0] if tags else "neutral"
    return {"state": state, "tags": tags, "trace": trace}


# ------------------------------------------------------------------ action

def _fmt_num(v: float, digits: int = 2) -> str:
    return f"{v:,.{digits}f}".replace(",", "_").replace(".", ",").replace("_", ".")


def _fmt_pct(v: float, digits: int = 0) -> str:
    return f"{v * 100:+.{digits}f}%".replace(".", ",")


def decide(ind: pd.Series, sc: pd.Series, state: dict, cfg: dict, cls: str = "stock") -> dict:
    """What to do with the asset now (pure rules over published metrics).

    candidate  top quintile, orderly uptrend (P > SMA50 > SMA200), no overheating, not loss-making
    wait       strong but overheated (Extended): buying now means buying a spike; wait for a pullback
    watch      interesting but not yet a buy (breakout unconfirmed, improving, loss-making, rank 60-80)
    avoid      speculative, weakening, momentum below the median or price below its SMA200
    none       nothing relevant

    `hold` answers the question for an asset you already own (buffer rule): keep it while it is not
    "avoid" and stays in the top half (overall >= hold.min_overall). Buying in the top 20% but only
    selling below the top 50% cuts turnover (and taxes) without changing the strategy's intent.
    """
    a = cfg["action"]
    f = lambda v: float(v) if v is not None and np.isfinite(v) else np.nan  # noqa: E731
    ov, mom = f(sc["overall"]), f(sc["momentum"])
    tags = set(state["tags"])
    px_s50, px_s200 = f(ind.get("px_vs_sma50")), f(ind.get("px_vs_sma200"))
    s50, s200 = f(ind.get("sma50")), f(ind.get("sma200"))
    profitable = ind.get("profitable")
    profitable = None if profitable is None or (isinstance(profitable, float) and not np.isfinite(profitable)) \
        else bool(profitable)
    uptrend = px_s50 > 0 and s50 > s200
    why: list[str] = []
    entry = None

    avoid = []
    if "speculative" in tags:
        avoid.append(f"Muy volátil: {_fmt_pct(f(ind['vol_63'])).lstrip('+')} anualizada en 63 sesiones")
    if "weakening" in tags:
        avoid.append("Era líder y está perdiendo impulso")
    if np.isfinite(mom) and mom < a["avoid"]["max_momentum"]:
        avoid.append(f"Momentum por debajo de la mitad del universo (p{int(round(mom))})")
    if np.isfinite(px_s200) and px_s200 < 0:
        avoid.append("Cotiza por debajo de su media de 200 sesiones (tendencia de fondo bajista)")

    if avoid:
        action, why = "avoid", avoid
    elif "extended" in tags and np.isfinite(ov) and ov >= a["watch"]["min_overall"]:
        action = "wait"
        tr = {c["text"]: c for c in state["trace"].get("extended", [])}
        atr = tr.get("ATRs sobre la SMA50")
        if atr and atr["pass"]:
            why.append(f"Precio a {_fmt_num(atr['value'], 1)} ATR por encima de su media de 50 sesiones "
                       f"(umbral {_fmt_num(atr['threshold'], 0)})")
        d200 = tr.get("Distancia a SMA200 menos su percentil 95 histórico")
        if d200 and d200["pass"]:
            why.append(f"Distancia a su media de 200 sesiones ({_fmt_pct(f(ind['dist200']))}) en máximos de su propia historia")
        r1 = tr.get("Subida de 1 mes")
        r1p = tr.get("Subida de 1 mes: percentil en el universo")
        if r1 and r1p and r1["pass"] and r1p["pass"]:
            why.append(f"Ha subido {_fmt_pct(f(ind['r1m']))} en un mes (5 % superior del universo)")
        if np.isfinite(s50):
            entry = ("Mejor punto de entrada: cuando el precio se acerque a su media de 50 sesiones "
                     f"(hoy {_fmt_num(s50)} $) y la subida del último mes se modere.")
    elif (np.isfinite(ov) and ov >= a["candidate"]["min_overall"] and mom >= a["candidate"]["min_momentum"]
          and uptrend and profitable is not False):
        action = "candidate"
        why.append(f"En el {max(1, int(round(100 - ov)))} % superior del universo, con tendencia ordenada "
                   "(precio > media 50 > media 200) y sin sobreextensión")
        if "breakout" in tags:
            why.append("Además acaba de romper máximos con volumen")
        if profitable is None and cls == "stock":
            why.append("Beneficios de la empresa no disponibles: revísalos tú antes de comprar")
    else:
        watch = []
        if np.isfinite(ov) and ov >= a["candidate"]["min_overall"] and profitable is False:
            watch.append("Puntuación alta, pero la empresa perdió dinero en su último ejercicio")
        if "breakout" in tags:
            watch.append("Ruptura reciente con volumen: falta confirmación")
        if "improving" in tags:
            watch.append("Su impulso mejora, pero aún no está entre las líderes")
        if np.isfinite(ov) and ov >= a["candidate"]["min_overall"] and not uptrend:
            watch.append("Puntuación alta, pero sin estructura alcista completa (precio > media 50 > media 200)")
        if (np.isfinite(ov) and ov >= a["candidate"]["min_overall"] and np.isfinite(mom)
                and mom < a["candidate"]["min_momentum"]):
            watch.append(f"Puntuación alta por calidad y bajo riesgo, pero su impulso aún no es de líder (p{int(round(mom))})")
        if not watch and np.isfinite(ov) and ov >= a["watch"]["min_overall"]:
            watch.append(f"Buena puntuación ({int(round(ov))}/100), aún fuera del 20 % superior")
        action, why = ("watch", watch) if watch else ("none", ["Sin una señal de momentum clara"])

    hold = action != "avoid" and np.isfinite(ov) and ov >= a["hold"]["min_overall"]
    return {"action": action, "label": ACTIONS[action], "why": why, "entry": entry, "hold": bool(hold)}
