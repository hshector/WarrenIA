import numpy as np
import pandas as pd

from warrenia_engine.backtest import BacktestConfig, metrics, rebalance_indices, run_backtest, signals, simulate
from warrenia_engine.calendar import last_closed_session
from warrenia_engine.compute import build_context
from warrenia_engine.panels import build_panels
from warrenia_engine.providers.synthetic import SyntheticProvider

from .conftest import NOW


def _ctx(cfg, seed=5):
    prov = SyntheticProvider(end=last_closed_session(NOW).session, sessions=380, n_stocks=120, n_etfs=10, seed=seed)
    bars = prov._bars
    P = build_panels(bars, prov._splits, prov._divs, sessions=prov.sessions)
    return build_context(cfg, P, prov.tickers(), prov.fundamentals(prov.tickers()))


def test_rebalance_dates_are_month_ends():
    d = pd.bdate_range("2025-01-01", "2025-04-30")
    idx = rebalance_indices(d, 0, len(d) - 1)
    assert [d[i].strftime("%Y-%m-%d") for i in idx] == ["2025-01-31", "2025-02-28", "2025-03-31"]


def test_signals_have_no_look_ahead(cfg):
    ctx = _ctx(cfg)
    rebal = rebalance_indices(ctx.P.dates, 300, len(ctx.P.dates) - 1)
    t0 = rebal[0]
    strategies = ["overall", "pure_12_1", "candidates", "candidates_buffer"]
    before = signals(ctx, [t0], strategies, 10)
    # Poison every price after the signal date: picks at t0 must not change.
    P = ctx.P
    for arr in (P.close, P.close_ff, P.open, P.high, P.low):
        arr[t0 + 1:] *= np.random.default_rng(0).uniform(0.2, 5.0, arr[t0 + 1:].shape)
    P.logret[t0 + 1:] = np.random.default_rng(1).normal(0, 0.2, P.logret[t0 + 1:].shape)
    ctx2 = build_context(cfg, P, pd.DataFrame(ctx.ref.reset_index()), None)
    ctx2.shares, ctx2.sector, ctx2.net_income = ctx.shares, ctx.sector, ctx.net_income
    after = signals(ctx2, [t0], strategies, 10)
    assert before == after


def test_simulate_single_asset_arithmetic(cfg, dates):
    from .conftest import make_bars
    px = 100 * np.cumprod(np.r_[1, np.full(len(dates) - 1, 1.001)])
    bars = make_bars({"SPY": px, "AAA": px * 2}, dates)
    bars.loc[(bars.ticker == "AAA"), "open"] = bars.loc[(bars.ticker == "AAA"), "close"] / 1.001  # open = prev close
    P = build_panels(bars, None, None)
    tk = pd.DataFrame([{"ticker": "SPY", "name": "S", "type": "ETF", "exchange": "ARCX", "active": True, "cik": None, "currency": "USD"},
                       {"ticker": "AAA", "name": "A", "type": "CS", "exchange": "XNAS", "active": True, "cik": None, "currency": "USD"}])
    ctx = build_context(cfg, P, tk, None)
    df = simulate(ctx, {100: ["AAA"]}, end_t=150, cost_bps=10)
    # buy at open of 101, then +0.1%/day; cost 10 bp on 100% turnover at entry
    expected = 1.001 ** 50 * (1 - 0.001)
    assert np.isclose((1 + df["ret"]).prod(), expected, rtol=1e-9)
    assert df.attrs["turnover"] == [1.0]


def test_metrics_basic():
    r = pd.Series([0.01, -0.02, 0.01, 0.0] * 63)
    m = metrics(r)
    assert m["days"] == 252 and m["max_drawdown"] > 0 and m["vol"] > 0


def test_short_history_is_reported_not_faked(cfg):
    ctx = _ctx(cfg)
    out = run_backtest(ctx, BacktestConfig(top_n=10))
    assert out["status"] == "ok" and out["conclusive"] is False
    assert out["period"]["rebalances"] >= 2
    assert any("NO concluyentes" in x for x in out["limitations"])


def test_buffer_keeps_holdings_in_top_half_and_fills_with_candidates():
    from warrenia_engine.backtest import select
    sc = pd.DataFrame({"rank": [1, 2, 3, 4, 5]}, index=["A", "B", "C", "D", "E"])
    actions = {"A": {"action": "candidate", "hold": True}, "B": {"action": "wait", "hold": True},
               "C": {"action": "candidate", "hold": True}, "D": {"action": "watch", "hold": True},
               "E": {"action": "avoid", "hold": False}}
    assert select("candidates", sc, sc, 2, actions) == ["A", "C"]
    # D (held, still in top half) is kept although it is no longer a candidate; E (avoid) is sold.
    assert select("candidates_buffer", sc, sc, 3, actions, prev=["D", "E"]) == ["D", "A", "C"]


def test_metrics_sortino_uses_downside_deviation():
    r = pd.Series([0.02, -0.01] * 126)
    m = metrics(r)
    dd = np.sqrt(np.mean(np.minimum(r, 0) ** 2)) * np.sqrt(252)
    assert np.isclose(m["sortino"], round(r.mean() * 252 / dd, 5))
