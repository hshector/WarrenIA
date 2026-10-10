import numpy as np
import pandas as pd

from warrenia_engine.indicators import Precomputed, indicators_at, max_drawdown, ols_trend, theil_sen
from warrenia_engine.panels import build_panels

from .conftest import make_bars


def _ind(P, cfg, t):
    pre = Precomputed(P, cfg.windows)
    return indicators_at(P, pre, t, cfg.windows, P.col("SPY"), cfg.momentum["classification"])


def test_returns_match_hand_calculation(simple_panels, cfg):
    P, _ = simple_panels
    t = len(P.dates) - 1
    ind = _ind(P, cfg, t)
    a = P.col("A")
    c = P.close[:, a]
    assert np.isclose(ind.loc["A", "r1m"], c[t] / c[t - 21] - 1)
    assert np.isclose(ind.loc["A", "r12m"], c[t] / c[t - 252] - 1)
    assert np.isclose(ind.loc["A", "r12_1"], c[t - 21] / c[t - 252] - 1)
    assert np.isclose(ind.loc["A", "r6_1"], c[t - 21] / c[t - 126] - 1)
    assert np.isclose(ind.loc["A", "sma50"], c[t - 49 : t + 1].mean())
    assert np.isclose(ind.loc["A", "sma200"], c[t - 199 : t + 1].mean())
    vol = np.std(np.diff(np.log(c[t - 252 : t + 1])), ddof=1) * np.sqrt(252)
    assert np.isclose(ind.loc["A", "vol_252"], vol)
    assert np.isclose(ind.loc["A", "mom_12_1_riskadj"], ind.loc["A", "r12_1"] / vol)


def test_beta_and_residual_momentum(simple_panels, cfg):
    P, _ = simple_panels
    ind = _ind(P, cfg, len(P.dates) - 1)
    assert np.isclose(ind.loc["A", "beta_252"], 2.0, atol=1e-9)
    assert np.isclose(ind.loc["SPY", "beta_252"], 1.0, atol=1e-9)
    # A is a pure 2x leverage of the market: no residual (leadership) momentum
    assert abs(ind.loc["A", "residual_mom"]) < 1e-6 or not np.isfinite(ind.loc["A", "residual_mom"])


def test_flat_series_has_zero_vol_and_no_score_inputs(simple_panels, cfg):
    P, _ = simple_panels
    ind = _ind(P, cfg, len(P.dates) - 1)
    assert ind.loc["B", "r12m"] == 0
    assert ind.loc["B", "vol_252"] == 0
    assert not np.isfinite(ind.loc["B", "mom_12_1_riskadj"])  # 0/0 -> NaN, not a fake signal


def test_no_look_ahead(simple_panels, cfg, dates):
    """Indicators at t must not change when the future is altered."""
    P, _ = simple_panels
    t = 320
    base = _ind(P, cfg, t)
    P.close[t + 1 :] *= 3.0
    P.close_ff[t + 1 :] *= 3.0
    P.high[t + 1 :] *= 3.0
    P.logret[t + 1 :] = 0.5
    P.volume[t + 1 :] *= 10
    P.open[t + 1 :] *= 3.0
    after = _ind(P, cfg, t)
    num = base.select_dtypes("number").columns
    pd.testing.assert_frame_equal(base[num], after[num])


def test_theil_sen_is_robust_to_a_single_spike():
    y = np.arange(21, dtype=float)[:, None] * 0.01
    y_spike = y.copy()
    y_spike[10] += 0.5
    assert np.isclose(theil_sen(y)[0], 0.01)
    assert np.isclose(theil_sen(y_spike)[0], 0.01, atol=1e-3)


def test_ols_trend_r2_one_for_exponential():
    logp = np.log(100 * np.exp(0.001 * np.arange(126)))[:, None]
    slope, r2 = ols_trend(logp)
    assert np.isclose(slope[0], 0.001) and np.isclose(r2[0], 1.0)


def test_max_drawdown():
    p = np.array([100, 120, 90, 110, 60, 130.0])[:, None]
    assert np.isclose(max_drawdown(p)[0], 0.5)


def test_bad_tick_detection(dates, cfg):
    rng = np.random.default_rng(1)
    spy = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, len(dates))))
    x = 50 * np.exp(np.cumsum(rng.normal(0, 0.01, len(dates))))
    x[380] *= 1.6  # one-day spike that reverts
    P = build_panels(make_bars({"SPY": spy, "X": x}, dates), None, None)
    ind = _ind(P, cfg, len(dates) - 1)
    assert ind.loc["X", "bad_ticks"] >= 1
    assert ind.loc["SPY", "bad_ticks"] == 0
