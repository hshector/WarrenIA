"""Wide (dates x tickers) panels with corporate-action adjustments.

Adjustment convention (backward, CRSP-style): prices before an ex-date are
multiplied by the event factor so the adjusted series is continuous and returns
are total returns (when dividends are available).
  split  factor = split_from / split_to      (4-for-1 => 0.25)
  cash dividend factor = 1 - D / close_raw[t-1]
Volumes are adjusted by the inverse split factor only. Dollar volume uses raw
close * raw volume, which is invariant to splits.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass
class Panels:
    dates: pd.DatetimeIndex
    tickers: np.ndarray
    open: np.ndarray
    high: np.ndarray
    low: np.ndarray
    close: np.ndarray          # adjusted (splits + dividends)
    raw_close: np.ndarray
    volume: np.ndarray         # split-adjusted shares
    dollar_volume: np.ndarray  # raw close * raw volume
    present: np.ndarray        # bool: a real bar exists for (t, i)
    close_ff: np.ndarray       # adjusted close forward-filled (max 5 sessions)
    logret: np.ndarray         # log returns of close_ff (NaN where no data)
    adjustment_notes: list[str] = field(default_factory=list)
    events: dict[str, list] = field(default_factory=dict)  # ticker -> [(ex_date, price_factor, kind, detail)]

    def col(self, ticker: str) -> int:
        idx = np.where(self.tickers == ticker)[0]
        if len(idx) == 0:
            raise KeyError(ticker)
        return int(idx[0])

    def has(self, ticker: str) -> bool:
        return bool((self.tickers == ticker).any())

    def t_index(self, d) -> int:
        return int(self.dates.get_loc(pd.Timestamp(d)))


def _pivot(bars: pd.DataFrame, col: str, dates: pd.DatetimeIndex, tickers: np.ndarray) -> np.ndarray:
    p = bars.pivot(index="date", columns="ticker", values=col)
    return p.reindex(index=dates, columns=tickers).to_numpy(dtype="float64", copy=True)


def build_panels(
    bars: pd.DataFrame,
    splits: pd.DataFrame | None,
    dividends: pd.DataFrame | None,
    sessions: list | None = None,
) -> Panels:
    bars = bars.drop_duplicates(["date", "ticker"], keep="last")
    dates = pd.DatetimeIndex(sorted(pd.to_datetime(sessions) if sessions is not None else bars["date"].unique()))
    tickers = np.array(sorted(bars["ticker"].unique()))
    o, h, l, c = (_pivot(bars, k, dates, tickers) for k in ("open", "high", "low", "close"))
    v = _pivot(bars, "volume", dates, tickers)
    present = ~np.isnan(c)
    notes: list[str] = []

    T, N = c.shape
    tix = {t: i for i, t in enumerate(tickers)}
    events: dict[str, list] = {}
    price_ev = np.ones((T, N))
    split_ev = np.ones((T, N))

    if splits is not None and not splits.empty:
        for row in splits.itertuples(index=False):
            i = tix.get(row.ticker)
            if i is None:
                continue
            t = dates.searchsorted(pd.Timestamp(row.ex_date))
            if t >= T or t == 0:
                continue
            if not (row.split_from > 0 and row.split_to > 0):
                notes.append(f"{row.ticker}: split ignored (invalid ratio)")
                continue
            f = float(row.split_from) / float(row.split_to)
            price_ev[t, i] *= f
            split_ev[t, i] *= f
            events.setdefault(row.ticker, []).append((dates[t].date().isoformat(), f, "split",
                                                      f"{row.split_to:g}:{row.split_from:g}"))

    if dividends is not None and not dividends.empty:
        c_ff_raw = pd.DataFrame(c).ffill(limit=5).to_numpy(copy=True)
        for row in dividends.itertuples(index=False):
            i = tix.get(row.ticker)
            if i is None or not (row.cash_amount and row.cash_amount > 0):
                continue
            if getattr(row, "currency", "USD") not in (None, "USD"):
                continue
            t = dates.searchsorted(pd.Timestamp(row.ex_date))
            if t >= T or t == 0:
                continue
            prev = c_ff_raw[t - 1, i]
            if not np.isfinite(prev) or prev <= 0:
                continue
            # Raw prev close is pre-split if a split happens later; express the
            # dividend on the same basis as the raw close at t-1.
            ratio = row.cash_amount / prev
            if ratio >= 0.5:
                notes.append(f"{row.ticker}: dividend {row.cash_amount} ignored (>{ratio:.0%} of the price)")
                continue
            price_ev[t, i] *= 1.0 - ratio
            events.setdefault(row.ticker, []).append((dates[t].date().isoformat(), 1.0 - ratio, "dividend",
                                                      f"{row.cash_amount:g}"))

    def backward_factor(ev: np.ndarray) -> np.ndarray:
        # factor[t] = prod_{s > t} ev[s]
        rev = np.cumprod(ev[::-1], axis=0)[::-1]
        out = np.ones_like(ev)
        out[:-1] = rev[1:]
        return out

    pf = backward_factor(price_ev)
    sf = backward_factor(split_ev)
    adj_o, adj_h, adj_l, adj_c = o * pf, h * pf, l * pf, c * pf
    adj_v = v / sf
    dollar = c * v

    close_ff = pd.DataFrame(adj_c).ffill(limit=5).to_numpy(copy=True)
    with np.errstate(divide="ignore", invalid="ignore"):
        logret = np.full_like(close_ff, np.nan)
        logret[1:] = np.log(close_ff[1:] / close_ff[:-1])
    return Panels(dates, tickers, adj_o, adj_h, adj_l, adj_c, c, adj_v, dollar, present, close_ff, logret, notes, events)
