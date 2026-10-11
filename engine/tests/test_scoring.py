import numpy as np
import pandas as pd

from warrenia_engine.scoring import classify, composite, decide, overall, pct_rank, rank_order


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
                breakout=False, price=100.0, px_vs_sma50=0.05, px_vs_sma200=0.18, sma50=95.0, sma200=85.0,
                dist_52w_high=0.02, r1m=0.04, profitable=1.0)
    base.update(kw)
    return pd.Series(base)


def _sc(**kw):
    base = dict(momentum=85.0, trend_quality=80.0, acceleration=50.0, risk=40.0, mom_pct_change=0.0, overall=92.0,
                r1m_pct=60.0)
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


def test_classify_extended_by_short_term_spike(cfg):
    """A leader that rose >= 15% in a month and sits in the universe's top 5% for 1m return is overheated."""
    r = classify(_ind(r1m=0.22), _sc(r1m_pct=97.0), cfg.momentum)
    assert r["state"] == "extended"
    # Both conditions are needed: a big 1m move that is common in the universe is not a spike.
    assert classify(_ind(r1m=0.22), _sc(r1m_pct=80.0), cfg.momentum)["state"] == "strong"
    assert classify(_ind(r1m=0.10), _sc(r1m_pct=99.0), cfg.momentum)["state"] == "strong"


def _decide(cfg, ind=None, sc=None, cls="stock"):
    ind = _ind() if ind is None else ind
    sc = _sc() if sc is None else sc
    return decide(ind, sc, classify(ind, sc, cfg.momentum), cfg.momentum, cls)


def test_action_candidate_requires_top_quintile_uptrend_and_no_overheating(cfg):
    d = _decide(cfg)
    assert d["action"] == "candidate" and d["hold"]
    assert _decide(cfg, sc=_sc(overall=75.0))["action"] == "watch"         # rank 60-80
    assert _decide(cfg, ind=_ind(px_vs_sma50=-0.01))["action"] == "watch"   # no orderly uptrend


def test_action_wait_when_overheated_never_candidate(cfg):
    d = _decide(cfg, ind=_ind(atr_above_sma50=4.5))
    assert d["action"] == "wait" and d["entry"] and any("daily moves" in w for w in d["why"])
    d = _decide(cfg, ind=_ind(r1m=0.25), sc=_sc(r1m_pct=98.0))
    assert d["action"] == "wait" and any("in one month" in w for w in d["why"])
    assert d["hold"]  # overheated is not a reason to sell what you already own


def test_action_avoid_and_sell_signal(cfg):
    assert _decide(cfg, ind=_ind(vol_63=0.8))["action"] == "avoid"                      # speculative
    d = _decide(cfg, sc=_sc(momentum=40.0, overall=45.0))
    assert d["action"] == "avoid" and not d["hold"]
    assert _decide(cfg, ind=_ind(px_vs_sma200=-0.02))["action"] == "avoid"              # below SMA200
    d = _decide(cfg, ind=_ind(sma50_cross_down=True), sc=_sc(mom_pct_change=-20.0))     # weakening
    assert d["action"] == "avoid" and not d["hold"]


def test_action_loss_making_company_is_watch_not_candidate(cfg):
    assert _decide(cfg, ind=_ind(profitable=0.0))["action"] == "watch"
    unknown = _decide(cfg, ind=_ind(profitable=np.nan))
    assert unknown["action"] == "candidate" and any("check the fundamentals yourself" in w for w in unknown["why"])
    etf = _decide(cfg, ind=_ind(profitable=np.nan), cls="etf")
    assert etf["action"] == "candidate" and not any("fundamentals" in w for w in etf["why"])


def test_hold_buffer_keeps_top_half(cfg):
    d = _decide(cfg, sc=_sc(overall=55.0, momentum=60.0))
    assert d["action"] != "candidate" and d["hold"]
    assert not _decide(cfg, sc=_sc(overall=45.0, momentum=60.0))["hold"]


GOOD = dict(fscore=7.0, zscore=4.0, cfo=1e9, share_change=0.0, accruals=-0.02, ebit_ev=0.05)


def test_fundamentals_pass_makes_a_candidate(cfg):
    d = _decide(cfg, ind=_ind(**GOOD))
    assert d["action"] == "candidate" and any("Passes the fundamental checks" in w for w in d["why"])


def test_distress_is_a_red_flag_avoid(cfg):
    d = _decide(cfg, ind=_ind(**{**GOOD, "zscore": 0.7}))
    assert d["action"] == "avoid" and not d["hold"] and any("Altman" in w for w in d["why"])


def test_each_yellow_flag_blocks_the_candidate(cfg):
    for k, v, text in [("fscore", 3.0, "F-Score 3/9"), ("cfo", -1e8, "Burns cash"), ("share_change", 0.12, "share count grew 12%"),
                       ("accruals", 0.2, "not backed by cash"), ("ebit_ev", 0.004, "Extremely expensive")]:
        d = _decide(cfg, ind=_ind(**{**GOOD, k: v}))
        assert d["action"] == "watch", k
        assert any(text in w for w in d["why"]), (k, d["why"])
        assert d["hold"]  # a yellow flag alone does not force a sale


def test_yellow_flags_also_shown_when_waiting(cfg):
    d = _decide(cfg, ind=_ind(**{**GOOD, "atr_above_sma50": 4.5, "fscore": 2.0}))
    assert d["action"] == "wait" and any("F-Score 2/9" in w for w in d["why"])


def test_bank_candidate_explains_why_health_scores_do_not_apply(cfg):
    d = _decide(cfg, ind=_ind(**{**GOOD, "fscore": np.nan, "zscore": np.nan, "roa": 0.012, "financial": True}))
    assert d["action"] == "candidate" and any("Bank or insurer" in w for w in d["why"])
