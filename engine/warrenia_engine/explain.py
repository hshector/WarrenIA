"""Deterministic explanations and opportunity reports.

Every number in these texts comes from the computed indicators of the run; no free
text generation is involved. Language: plain English (UI language). Jargon is avoided
or explained in the same sentence.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .scoring import ACTIONS, STATES

LABELS = {
    "mom_12_1_riskadj": "12-month gain (skipping the last month), adjusted for volatility",
    "mom_6_1_riskadj": "6-month gain (skipping the last month), adjusted for volatility",
    "consistency": "Share of up days minus down days over the year",
    "signed_r2": "How straight the 6-month trend is",
    "ma_structure": "Moving-average checks passed (0-5)",
    "high52_proximity": "Closeness to the 1-year high",
    "mom_pct_change": "Change in momentum rank over 1 month",
    "rs_slope_change": "Speed-up versus the market (last month vs prior 3)",
    "vol_63": "Volatility (last 3 months)",
    "maxdd_252": "Worst fall in the last year",
    "beta_252": "Sensitivity to the market (beta)",
    "gap_freq": "How often it opens with a big jump",
    "concentration": "Share of the move made in just 5 days",
    "atr_pct": "Average daily move (informative, not scored)",
    "residual_mom": "Leadership: gain beyond what the market explains (informative)",
}


def _ok(v) -> bool:
    return v is not None and isinstance(v, (int, float, np.floating, np.integer)) and math.isfinite(float(v))


def pct(v, digits: int = 1, sign: bool = True) -> str:
    if not _ok(v):
        return "n/a"
    return f"{float(v) * 100:+.{digits}f}%" if sign else f"{float(v) * 100:.{digits}f}%"


def num(v, digits: int = 2) -> str:
    return f"{float(v):,.{digits}f}" if _ok(v) else "n/a"


def usd_compact(v) -> str:
    if not _ok(v):
        return "n/a"
    v = float(v)
    for div, suf in ((1e12, "T"), (1e9, "B"), (1e6, "M")):
        if abs(v) >= div:
            return f"${v / div:,.1f}{suf}"
    return f"${v:,.0f}"


def p(v) -> str:
    return "n/a" if not _ok(v) else f"{int(round(float(v)))}/100"


def short_reasons(ind: pd.Series, sc: pd.Series) -> list[str]:
    """Up to 3 short drivers for the radar table."""
    out: list[str] = []
    if _ok(sc.get("momentum")) and sc["momentum"] >= 60:
        out.append(f"{pct(ind['r12_1'], 0)} in a year with {pct(ind['vol_252'], 0, False)} volatility")
    elif _ok(sc.get("momentum")) and sc["momentum"] < 40:
        out.append(f"Weak trend ({p(sc['momentum'])})")
    if _ok(ind.get("dist_52w_high")) and ind["dist_52w_high"] <= 0.03:
        out.append("at its 1-year high" if ind["dist_52w_high"] <= 0.005 else f"{pct(ind['dist_52w_high'], 0, False)} below its 1-year high")
    if bool(ind.get("breakout")):
        out.append(f"new high on {num(ind['breakout_vol_mult'], 1)}x volume")
    if _ok(sc.get("pct_rs_slope_change")):
        if sc["pct_rs_slope_change"] >= 85:
            out.append("speeding up versus the market")
        elif sc["pct_rs_slope_change"] <= 15:
            out.append("slowing down versus the market")
    if _ok(sc.get("risk")) and sc["risk"] >= 75:
        comps = {k: sc.get(f"pct_{k}") for k in ("vol_63", "maxdd_252", "beta_252", "gap_freq", "concentration")}
        comps = {k: v for k, v in comps.items() if _ok(v)}
        if comps:
            top = max(comps, key=comps.get)
            names = {"vol_63": "big swings", "maxdd_252": "deep falls", "beta_252": "high market sensitivity",
                     "gap_freq": "frequent price jumps", "concentration": "moves made in a few days"}
            out.append(f"high risk: {names[top]}")
    return out[:3]


def horizon_profile(row_pcts: dict[str, float]) -> tuple[list[str], list[str]]:
    names = {"r1m": "1 month", "r3m": "3 months", "r6m": "6 months", "r12m": "12 months"}
    strong = [names[k] for k, v in row_pcts.items() if _ok(v) and v >= 70]
    weak = [names[k] for k, v in row_pcts.items() if _ok(v) and v <= 40]
    return strong, weak


def fundamental_lines(ind: pd.Series) -> tuple[list[dict], list[str]]:
    """Evidence rows and risk lines from the last annual report (stocks)."""
    ev: list[dict] = []
    risks: list[str] = []
    if _ok(ind.get("roa")) or _ok(ind.get("fscore")) or _ok(ind.get("zscore")):
        ev.append({"label": "Profitability (return on assets / gross profit on assets)",
                   "value": f"{pct(ind.get('roa'), 1, False)} / {pct(ind.get('gross_profitability'), 0, False)}",
                   "context": f"last fiscal year ending {ind.get('fy_end')}"})
        ev.append({"label": "Financial health (Piotroski F-Score / Altman Z'')",
                   "value": f"{int(ind['fscore']) if _ok(ind.get('fscore')) else 'n/a'}/9 · {num(ind.get('zscore'), 1)}",
                   "context": "F-Score 7-9 strong, 0-3 weak · Z'' above 2.6 safe, below 1.1 danger"})
        ev.append({"label": "Valuation (earnings yield EBIT/EV / free-cash-flow yield)",
                   "value": f"{pct(ind.get('ebit_ev'), 1, False)} / {pct(ind.get('fcf_yield'), 1, False)}",
                   "context": f"P/E {num(ind.get('pe'), 1)} · higher yield = cheaper"})
        ev.append({"label": "Growth and dilution", "value": f"sales {pct(ind.get('revenue_growth'), 0)} · shares {pct(ind.get('share_change'), 1)}",
                   "context": "last fiscal year vs the one before"})
        if _ok(ind.get("pe")) and ind["pe"] >= 60:
            risks.append(f"Expensive: P/E of {num(ind['pe'], 0)}. Momentum also works in expensive stocks, but their falls tend to be sharper.")
    else:
        ev.append({"label": "Fundamentals", "value": "n/a",
                   "context": "no annual report data (XBRL) at the SEC for this company"})
    return ev, risks


def report(tk: str, name: str, cls: str, ind: pd.Series, sc: pd.Series, state: dict, act: dict,
           bench: str, bench_ret: dict[str, float], horizon_pcts: dict[str, float],
           universe_label: str, quality: dict) -> dict:
    """Structured opportunity card (Thesis / Evidence / Risks / What to watch / Data quality)."""
    st_name = STATES[state["state"]]
    fired = [c["text"] for c in state["trace"].get(state["state"], []) if c["pass"]]

    thesis = [
        f"{tk} is {pct(ind['r12m'])} over 12 months ({pct(ind['r12_1'])} excluding the last month) and trades "
        f"{pct(ind['px_vs_sma200'])} versus its 200-day average.",
        f"Among {universe_label}: trend strength {p(sc['momentum'])}, trend quality {p(sc['trend_quality'])}, "
        f"acceleration {p(sc['acceleration'])} and risk {p(sc['risk'])} (0 = calmest).",
    ]
    if state["state"] != "neutral":
        thesis.append(f"Status “{st_name}” because: " + "; ".join(fired) + ".")
    else:
        thesis.append("It does not match any specific status (no clear trend).")

    def vs(h):
        b = bench_ret.get(h)
        a = ind[h]
        if not (_ok(a) and _ok(b)):
            return "n/a"
        return pct((1 + a) / (1 + b) - 1)

    evidence = [
        {"label": "Return 1m / 3m / 6m / 12m",
         "value": " / ".join(pct(ind[h]) for h in ("r1m", "r3m", "r6m", "r12m")),
         "context": f"versus {bench}: " + " / ".join(vs(h) for h in ("r1m", "r3m", "r6m", "r12m"))},
        {"label": "12-month gain adjusted for volatility", "value": num(ind["mom_12_1_riskadj"]),
         "context": f"{pct(ind['r12_1'])} / yearly volatility {pct(ind['vol_252'], 1, False)}"},
        {"label": "Leadership (gain beyond what the market explains)", "value": num(ind["residual_mom"]),
         "context": "positive = rises more than its link to the market explains"},
        {"label": "Trend", "value": f"{int(ind['ma_structure']) if _ok(ind['ma_structure']) else 'n/a'}/5 moving-average checks",
         "context": f"trend straightness {num(ind['r2_126'])}, {pct(ind['pct_up_days'], 0, False)} up days"},
        {"label": "1-year high", "value": f"{pct(ind['dist_52w_high'], 1, False)} below",
         "context": "new high" if bool(ind["new_52w_high"]) else ""},
        {"label": "Recent volume (5d vs 50d)", "value": f"{num(ind['rel_volume'], 2)}x",
         "context": f"average traded per day {usd_compact(ind['adv_63'])}"},
        {"label": "Volatility / average daily move", "value": f"{pct(ind['vol_63'], 1, False)} / {pct(ind['atr_pct'], 1, False)}",
         "context": f"beta {num(ind['beta_252'])}"},
        {"label": "Worst fall in a year / now", "value": f"{pct(ind['maxdd_252'], 1, False)} / {pct(ind['dd_now'], 1, False)}",
         "context": ""},
    ]
    strong_h, weak_h = horizon_profile(horizon_pcts)
    if strong_h:
        evidence.append({"label": "Stands out over (top 30%)", "value": ", ".join(strong_h), "context": ""})
    if weak_h:
        evidence.append({"label": "Does not stand out over (bottom 40%)", "value": ", ".join(weak_h), "context": ""})

    risks: list[str] = []
    if cls == "stock":
        fev, frisk = fundamental_lines(ind)
        evidence += fev
        risks += act.get("red_flags", []) + act.get("yellow_flags", []) + frisk
    if "extended" in state["tags"]:
        risks.append(f"Ran up too fast: {num(ind['atr_above_sma50'], 1)} average daily moves above its 50-day average; "
                     f"{pct(ind['dist200'])} above its 200-day average (its usual maximum: {pct(ind['dist200_own_q'])}).")
    if _ok(ind["vol_63"]) and ind["vol_63"] > 0.45:
        risks.append(f"Big swings: {pct(ind['vol_63'], 0, False)} yearly volatility over the last 3 months.")
    if _ok(sc.get("pct_gap_freq")) and sc["pct_gap_freq"] >= 75:
        risks.append(f"Frequent jumps: {pct(ind['gap_freq'], 0, False)} of days open with a jump bigger than 2 normal daily moves.")
    if _ok(ind["concentration"]) and ind["concentration"] >= 0.35:
        risks.append(f"Lumpy move: its 5 biggest days explain {pct(ind['concentration'], 0, False)} of its 6-month movement.")
    if _ok(ind["beta_252"]) and ind["beta_252"] >= 1.5:
        risks.append(f"Very sensitive to the market (beta {num(ind['beta_252'])}): it tends to fall more when the market falls.")
    if _ok(ind["dd_now"]) and ind["dd_now"] >= 0.10:
        risks.append(f"Already {pct(ind['dd_now'], 0, False)} below its 1-year high.")
    if "weakening" in state["tags"]:
        risks.append("Signs of losing steam: " + "; ".join(
            c["text"] for c in state["trace"]["weakening"][1:] if c["pass"]) + ".")
    if _ok(sc.get("mom_pct_change")) and sc["mom_pct_change"] <= -10 and "weakening" not in state["tags"]:
        risks.append(f"Its momentum rank fell {num(-sc['mom_pct_change'], 0)} points in the last month.")
    if not risks:
        risks.append("No specific warnings under the current rules. The general momentum risk remains: sharp "
                     "reversals after market falls.")

    invalidation = [
        f"A close below its 50-day average (today {num(ind['sma50'])}; price is {pct(ind['px_vs_sma50'])} from it).",
        f"Trend strength dropping below 50/100 (today {p(sc['momentum'])}).",
        f"The 50-day average falling below the 200-day (today {num(ind['sma50'])} vs {num(ind['sma200'])}).",
        f"Steadily losing ground against {bench} (change over the last month today: {pct(np.expm1(ind['rs_slope_21']))}).",
    ]
    if bool(ind["breakout"]):
        invalidation.insert(0, "Falling back below the previous high it just broke: the breakout would fail.")

    return {
        "ticker": tk, "name": name, "cls": cls, "state": state["state"], "state_label": st_name,
        "action": act["action"], "action_label": ACTIONS[act["action"]], "action_why": act["why"],
        "entry": act["entry"],
        "thesis": thesis, "evidence": evidence, "risks": risks, "invalidation": invalidation,
        "data_quality": quality,
        "disclaimer": "Quantitative analysis of prices and published financial statements. Not personal advice; "
                      "past momentum does not guarantee future returns.",
    }
