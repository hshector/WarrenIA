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
             cond("Distancia a SMA200 menos su percentil 95 histórico", f(ind["dist200"]) - f(ind["dist200_own_q"]), ">", 0.0)]
    trace["extended"] = t_ext
    extended = t_ext[0]["pass"] and (t_ext[1]["pass"] or t_ext[2]["pass"])

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
