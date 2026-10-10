import numpy as np
import pandas as pd

from warrenia_engine.scoring import classify, composite, overall, pct_rank, rank_order


def test_pct_rank_symmetric_and_nan_safe():
    s = pd.Series([1.0, 2.0, np.nan, 3.0, 4.0], index=list("abcde"))
    r = pct_rank(s)
    assert np.isnan(r["c"])
    assert r["a"] == 12.5 and r["e"] == 87.5
    assert np.isclose(r.dropna().mean(), 50)


def test_composite_renormalises_missing_components():
    comp = pd.DataFrame({"x": [10.0, 90.0, 50.0], "y": [np.nan, np.nan, 50.0]}, index=list("abc"))
    out = composite(comp, {"x": 0.6, "y": 0.4}, min_weight=0.5)
    assert out["b"] > out["a"]
    out_strict = composite(comp, {"x": 0.4, "y": 0.6}, min_weight=0.5)
    assert np.isnan(out_strict["a"])  # only 40% of the weight available


def test_overall_and_rank_order_ties_broken_deterministically():
    sc = pd.DataFrame({"momentum": [90, 90, 10.0], "trend_quality": [50, 50, 50.0],
                       "acceleration": [50, 50, 50.0], "risk": [50, 50, 50.0]}, index=["ZZZ", "AAA", "MMM"])
    sc["overall"] = overall(sc, {"momentum": 0.5, "trend_quality": 0.25, "acceleration": 0.1, "inverse_risk": 0.15})
    r = rank_order(sc)
    assert r["AAA"] == 1 and r["ZZZ"] == 2 and r["MMM"] == 3


def test_overall_requires_momentum():
    sc = pd.DataFrame({"momentum": [np.nan, 50.0], "trend_quality": [90, 50.0], "acceleration": [90, 50.0],
                       "risk": [10, 50.0]}, index=["a", "b"])
    o = overall(sc, {"momentum": 0.5, "trend_quality": 0.25, "acceleration": 0.1, "inverse_risk": 0.15})
    assert np.isnan(o["a"]) and np.isfinite(o["b"])


def _ind(**kw):
    base = dict(vol_63=0.25, atr_above_sma50=1.0, dist200=0.1, dist200_own_q=0.3, sma50_cross_down=False,
                breakout=False, price=100.0, px_vs_sma50=0.05, sma50=95.0, sma200=85.0, dist_52w_high=0.02)
    base.update(kw)
    return pd.Series(base)


def _sc(**kw):
    base = dict(momentum=85.0, trend_quality=80.0, acceleration=50.0, risk=40.0, mom_pct_change=0.0)
    base.update(kw)
    return pd.Series(base)


def test_classify_strong_uptrend(cfg):
    r = classify(_ind(), _sc(), cfg.momentum)
    assert r["state"] == "strong"


def test_classify_precedence_speculative_over_strong(cfg):
    r = classify(_ind(vol_63=0.75), _sc(), cfg.momentum)
    assert r["state"] == "speculative" and "strong" in r["tags"]


def test_classify_extended(cfg):
    r = classify(_ind(atr_above_sma50=4.0), _sc(), cfg.momentum)
    assert r["state"] == "extended"


def test_classify_weakening_needs_two_signals(cfg):
    one = classify(_ind(), _sc(mom_pct_change=-20), cfg.momentum)
    assert one["state"] != "weakening"
    two = classify(_ind(sma50_cross_down=True), _sc(mom_pct_change=-20), cfg.momentum)
    assert two["state"] == "weakening"


def test_classify_breakout_and_improving_and_neutral(cfg):
    assert classify(_ind(breakout=True, dist_52w_high=0.2), _sc(momentum=60), cfg.momentum)["state"] == "breakout"
    assert classify(_ind(dist_52w_high=0.2), _sc(momentum=60, mom_pct_change=20, acceleration=80),
                    cfg.momentum)["state"] == "improving"
    assert classify(_ind(dist_52w_high=0.2), _sc(momentum=55), cfg.momentum)["state"] == "neutral"


def test_classification_trace_is_explicit(cfg):
    r = classify(_ind(), _sc(), cfg.momentum)
    for rule, conds in r["trace"].items():
        for c in conds:
            assert {"text", "value", "op", "threshold", "pass"} <= set(c)
