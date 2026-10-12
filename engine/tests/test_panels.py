import numpy as np
import pandas as pd

from warrenia_engine.panels import build_panels

from .conftest import make_bars


def test_split_adjustment_makes_series_continuous(dates):
    true = np.linspace(100, 120, len(dates))
    raw = true.copy()
    ex = 200
    raw[:ex] *= 4.0  # pre-split raw prices are 4x (4-for-1 split at index 200)
    bars = make_bars({"S": raw}, dates)
    bars.loc[bars["date"] < dates[ex], "volume"] = 250.0  # pre-split share volume is 4x smaller
    splits = pd.DataFrame([{"ticker": "S", "ex_date": dates[ex].date(), "split_from": 1.0, "split_to": 4.0}])
    P = build_panels(bars, splits, None)
    np.testing.assert_allclose(P.close[:, 0], true, rtol=1e-12)
    # raw close is untouched (used for price filters and dollar volume)
    assert P.raw_close[0, 0] == raw[0]
    # volume adjusted to post-split shares, dollar volume invariant
    assert P.volume[0, 0] == 1000.0
    assert P.dollar_volume[0, 0] == raw[0] * 250.0
    # no artificial -75% return on the ex-date
    assert abs(P.logret[ex, 0]) < 0.01


def test_dividend_adjustment_produces_total_return(dates):
    px = np.full(len(dates), 100.0)
    px[150:] = 98.0  # price drops by the 2.0 dividend on the ex-date
    bars = make_bars({"D": px}, dates)
    divs = pd.DataFrame([{"ticker": "D", "ex_date": dates[150].date(), "cash_amount": 2.0, "currency": "USD"}])
    P = build_panels(bars, None, divs)
    # Total return across the ex-date is ~0 (price drop compensated by the dividend)
    assert abs(P.close[150, 0] / P.close[149, 0] - 1) < 1e-12
    np.testing.assert_allclose(P.close[0, 0], 98.0)


def test_absurd_dividend_is_ignored_and_noted(dates):
    bars = make_bars({"D": np.full(len(dates), 10.0)}, dates)
    divs = pd.DataFrame([{"ticker": "D", "ex_date": dates[100].date(), "cash_amount": 9.0, "currency": "USD"}])
    P = build_panels(bars, None, divs)
    assert P.close[0, 0] == 10.0
    assert any("ignored" in n for n in P.adjustment_notes)


def test_missing_bars_are_nan_and_ffilled_limited(dates):
    px = np.full(len(dates), 10.0)
    px[50:60] = np.nan
    P = build_panels(make_bars({"G": px}, dates), None, None, sessions=list(dates))
    assert not P.present[55, 0]
    assert np.isfinite(P.close_ff[54, 0])  # within 5-session ffill
    assert np.isnan(P.close_ff[57, 0])     # beyond the limit: no fabricated prices
