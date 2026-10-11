"""Cross-sectional scores (0-100 percentiles), overall rank and rule-based states."""

from __future__ import annotations

import numpy as np
import pandas as pd

SCORE_KEYS = ["momentum", "trend_quality", "acceleration", "risk"]

STATES = {
    "speculative": "Very volatile",
    "extended": "Ran up too fast",
    "weakening": "Losing steam",
    "breakout": "New high (unconfirmed)",
    "strong": "Strong, steady trend",
    "improving": "Gaining strength",
    "neutral": "No clear trend",
}

# Rule texts referenced by decide() (kept as constants so both stay in sync).
EXT_ATR = "Daily moves (ATR) above the 50-day average"
EXT_D200 = "Distance to the 200-day average minus its own 95th percentile"
EXT_R1M_PCT = "1-month gain: percentile in the market"
EXT_R1M = "1-month gain"
STATE_ORDER = ["speculative", "extended", "weakening", "breakout", "strong", "improving"]

ACTIONS = {
    "candidate": "Buy candidate",
    "wait": "Wait for a dip",
    "watch": "Watch",
    "avoid": "Avoid",
    "none": "No signal",
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
    t_sp = [cond("Yearly volatility (last 3 months)", ind["vol_63"], ">=", sp["abs_vol_63"]),
            cond("Risk Score", risk, ">=", sp["min_risk"]),
            cond("Yearly volatility, with a high risk score", ind["vol_63"], ">=", sp["min_vol_63_with_risk"])]
    trace["speculative"] = t_sp
    spec = t_sp[0]["pass"] or (t_sp[1]["pass"] and t_sp[2]["pass"])

    ex = c["extended"]
    t_ext = [cond("Momentum score", mom, ">=", ex["min_momentum"]),
             cond(EXT_ATR, ind["atr_above_sma50"], ">", ex["atr_above_sma50"]),
             cond(EXT_D200, f(ind["dist200"]) - f(ind["dist200_own_q"]), ">", 0.0),
             cond(EXT_R1M_PCT, sc.get("r1m_pct", np.nan), ">=", ex["spike_r1m_pct"]),
             cond(EXT_R1M, ind.get("r1m", np.nan), ">=", ex["spike_r1m_min"])]
    trace["extended"] = t_ext
    spike = t_ext[3]["pass"] and t_ext[4]["pass"]
    extended = t_ext[0]["pass"] and (t_ext[1]["pass"] or t_ext[2]["pass"] or spike)

    wk = c["weakening"]
    t_wk = [cond("Momentum score", mom, ">=", wk["min_momentum"]),
            cond("Change in momentum percentile over 1 month", dmom, "<=", -wk["mom_pct_drop"]),
            boolc(f"Fell below its 50-day average after {wk['sma50_days_above']}+ days above it", ind["sma50_cross_down"]),
            cond("Acceleration Score", acc, "<=", wk["max_acceleration"])]
    trace["weakening"] = t_wk
    weakening = t_wk[0]["pass"] and sum(x["pass"] for x in t_wk[1:]) >= wk["min_signals"]

    t_bo = [boolc(f"Closed above its previous {c['breakout']['lookback_high']}-day high in the last "
                  f"{c['breakout']['recent_sessions']} days, on {c['breakout']['volume_multiple']}x normal volume, "
                  f"after a quiet period", ind["breakout"])]
    trace["breakout"] = t_bo
    breakout = t_bo[0]["pass"]

    st = c["strong"]
    t_st = [cond("Momentum score", mom, ">=", st["min_momentum"]),
            cond("Trend Quality", tq, ">=", st["min_trend_quality"]),
            boolc("Price above 50-day average, which is above the 200-day", f(ind["price"]) > 0 and f(ind["px_vs_sma50"]) > 0 and f(ind["sma50"]) > f(ind["sma200"])),
            cond("Distance to the 1-year high", ind["dist_52w_high"], "<=", st["max_dist_52w_high"])]
    trace["strong"] = t_st
    strong = all(x["pass"] for x in t_st)

    im = c["improving"]
    t_im = [cond("Change in momentum percentile over 1 month", dmom, ">=", im["mom_pct_rise"]),
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
    return f"{v:,.{digits}f}"


def _fmt_pct(v: float, digits: int = 0) -> str:
    return f"{v * 100:+.{digits}f}%"


def fundamental_flags(ind: pd.Series, cfg: dict) -> tuple[list[str], list[str]]:
    """(red flags -> Avoid, yellow flags -> not a buy yet). Unknown data never raises a flag."""
    r = cfg["fundamentals"]["rules"]
    g = lambda k: ind.get(k, np.nan)  # noqa: E731
    ok = lambda v: v is not None and not (isinstance(v, float) and not np.isfinite(v))  # noqa: E731
    red, yellow = [], []
    z = g("zscore")
    if ok(z) and z < r["distress_zscore"]:
        red.append(f"Balance sheet in the danger zone: Altman Z'' {z:.1f} (below {r['distress_zscore']:g} means a high risk "
                   "of financial distress)")
    if ok(g("profitable")) and g("profitable") == 0:
        yellow.append("Lost money in its last fiscal year")
    cfo = g("cfo")
    if ok(cfo) and cfo < 0:
        yellow.append("Burns cash: operating cash flow was negative last year")
    f = g("fscore")
    if ok(f) and f < r["min_fscore"]:
        yellow.append(f"Weak financial health: Piotroski F-Score {int(f)}/9 (needs {r['min_fscore']}+)")
    d = g("share_change")
    if ok(d) and d > r["max_dilution"]:
        yellow.append(f"Dilutes shareholders: share count grew {d * 100:.0f}% last year")
    acc = g("accruals")
    if ok(acc) and acc > r["max_accruals"]:
        yellow.append(f"Profits not backed by cash: accruals {acc * 100:.0f}% of assets")
    ey = g("ebit_ev")
    if ok(ey) and ey < r["min_ebit_ev"]:
        yellow.append("Extremely expensive: the business earns less than 1% of what it costs (EV/EBIT above 100)")
    return red, yellow


def decide(ind: pd.Series, sc: pd.Series, state: dict, cfg: dict, cls: str = "stock") -> dict:
    """What to do with the asset now (pure rules over published metrics).

    candidate  top 20% by momentum score, steady uptrend (price > 50-day avg > 200-day avg), has not
               shot up too fast, and passes every fundamental check that has data
    wait       strong but ran up too fast (Extended): buying now means buying the spike
    watch      interesting but not a buy yet (unconfirmed breakout, gaining strength, a yellow flag)
    avoid      very volatile, losing steam, weak momentum, below its 200-day average, or a red flag
    none       nothing relevant

    `hold` answers the question for an asset you already own (buffer rule): keep it while it is not
    "avoid" and stays in the top half (overall >= hold.min_overall).
    """
    a = cfg["action"]
    f = lambda v: float(v) if v is not None and np.isfinite(v) else np.nan  # noqa: E731
    ov, mom = f(sc["overall"]), f(sc["momentum"])
    tags = set(state["tags"])
    px_s50, px_s200 = f(ind.get("px_vs_sma50")), f(ind.get("px_vs_sma200"))
    s50, s200 = f(ind.get("sma50")), f(ind.get("sma200"))
    uptrend = px_s50 > 0 and s50 > s200
    red, yellow = fundamental_flags(ind, cfg) if cls == "stock" else ([], [])
    why: list[str] = []
    entry = None

    avoid = list(red)
    if "speculative" in tags:
        avoid.append(f"Very volatile: swings of {f(ind['vol_63']) * 100:.0f}% a year")
    if "weakening" in tags:
        avoid.append("Was a leader and is losing steam")
    if np.isfinite(mom) and mom < a["avoid"]["max_momentum"]:
        avoid.append(f"Weaker trend than half the market (momentum {int(round(mom))}/100)")
    if np.isfinite(px_s200) and px_s200 < 0:
        avoid.append("Trading below its 200-day average: the long-term trend is down")

    if avoid:
        action, why = "avoid", avoid
    elif "extended" in tags and np.isfinite(ov) and ov >= a["watch"]["min_overall"]:
        action = "wait"
        tr = {c["text"]: c for c in state["trace"].get("extended", [])}
        atr = tr.get(EXT_ATR)
        if atr and atr["pass"]:
            why.append(f"Price is {atr['value']:.1f} daily moves above its 50-day average (limit {atr['threshold']:g})")
        d200 = tr.get(EXT_D200)
        if d200 and d200["pass"]:
            why.append(f"Furthest above its 200-day average ({_fmt_pct(f(ind['dist200']))}) in its own history")
        r1, r1p = tr.get(EXT_R1M), tr.get(EXT_R1M_PCT)
        if r1 and r1p and r1["pass"] and r1p["pass"]:
            why.append(f"Up {_fmt_pct(f(ind['r1m']))} in one month (top 5% of the market)")
        why += yellow
        if np.isfinite(s50):
            entry = (f"Better entry: when the price comes back towards its 50-day average (today ${_fmt_num(s50)}) "
                     "and the last month's jump cools off.")
    elif (np.isfinite(ov) and ov >= a["candidate"]["min_overall"] and mom >= a["candidate"]["min_momentum"]
          and uptrend and not yellow):
        action = "candidate"
        why.append(f"In the top {max(1, int(round(100 - ov)))}% of the market, rising steadily "
                   "(price above its 50-day average, which is above the 200-day) without having shot up")
        if "breakout" in tags:
            why.append("It also just broke to a new high on strong volume")
        has_fund = any(np.isfinite(f(ind.get(k))) for k in ("roa", "fscore", "zscore"))
        if cls == "stock" and not has_fund:
            why.append("No US GAAP financial statements (e.g. foreign company): check the fundamentals yourself")
        elif cls == "stock" and bool(ind.get("financial")) is True:
            why.append("Bank or insurer: the health scores (F-Score, Z'') do not apply; profitability checks passed")
        elif cls == "stock":
            why.append("Passes the fundamental checks: profitable, cash-backed earnings, no distress, no heavy dilution")
    else:
        watch = list(yellow)
        if "breakout" in tags:
            watch.append("Just broke to a new high on strong volume: needs confirmation")
        if "improving" in tags:
            watch.append("Gaining strength, but not a leader yet")
        top = np.isfinite(ov) and ov >= a["candidate"]["min_overall"]
        if top and not uptrend:
            watch.append("High score, but the trend is not orderly yet (price, 50-day and 200-day averages not stacked upwards)")
        if top and np.isfinite(mom) and mom < a["candidate"]["min_momentum"]:
            watch.append(f"High score thanks to quality and low risk, but its trend is not a leader's (momentum {int(round(mom))}/100)")
        if not watch and np.isfinite(ov) and ov >= a["watch"]["min_overall"]:
            watch.append(f"Good score ({int(round(ov))}/100) but outside the top 20%")
        action, why = ("watch", watch) if watch else ("none", ["No clear momentum signal"])

    hold = action != "avoid" and np.isfinite(ov) and ov >= a["hold"]["min_overall"]
    return {"action": action, "label": ACTIONS[action], "why": why, "entry": entry, "hold": bool(hold),
            "red_flags": red, "yellow_flags": yellow}


# ------------------------------------------------------------------ fundamentals

FUND_SIGN = {"low_accruals": ("accruals", -1), "low_debt": ("debt_assets", -1)}


def fundamental_scores(fund: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Quality, Safety, Value and the overall Fundamentals score (0-100 percentiles).

    Rows without data stay NaN (unknown is never "bad"). Each score needs at least half of
    its component weight, like the momentum scores.
    """
    fc = cfg["fundamentals"]
    out = pd.DataFrame(index=fund.index)
    if fund.empty:
        for k in ("f_quality", "f_safety", "f_value", "fund"):
            out[k] = np.nan
        return out
    comps = {}
    for score in fc["scores"].values():
        for k in score:
            src, sign = FUND_SIGN.get(k, (k, 1))
            x = pd.to_numeric(fund[src], errors="coerce") if src in fund else pd.Series(np.nan, index=fund.index)
            comps[k] = pct_rank(sign * x)
    comp = pd.DataFrame(comps, index=fund.index)
    for name, w in fc["scores"].items():
        out[f"f_{name}"] = composite(comp, w, 0.5)
    sub = out.rename(columns={f"f_{k}": k for k in fc["overall"]})
    out["fund"] = composite(sub, fc["overall"], 0.6)
    return out.join(comp.add_prefix("fpct_"))
