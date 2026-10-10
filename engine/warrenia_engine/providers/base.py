"""Provider interfaces and the canonical (normalised) data formats.

Every adapter must return these exact columns so the rest of the pipeline is
provider-agnostic. Prices are RAW (unadjusted); adjustments are computed by the
engine from split and dividend events, which keeps them reproducible.
"""

from __future__ import annotations

from datetime import date
from typing import Protocol

import pandas as pd

BAR_COLUMNS = ["date", "ticker", "open", "high", "low", "close", "volume", "vwap"]
TICKER_COLUMNS = ["ticker", "name", "type", "exchange", "active", "cik", "currency"]
SPLIT_COLUMNS = ["ticker", "ex_date", "split_from", "split_to"]
DIVIDEND_COLUMNS = ["ticker", "ex_date", "cash_amount", "currency"]
FUNDAMENTAL_COLUMNS = ["ticker", "cik", "sic", "sic_description", "shares", "shares_asof", "source"]


def empty(columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame({c: pd.Series(dtype="object") for c in columns})


class MarketProvider(Protocol):
    name: str
    demo: bool
    total_return: bool  # whether dividend events are available

    def earliest_available(self, today: date) -> date | None:
        """First date the plan allows (None = no restriction known)."""

    def grouped_daily(self, session: date) -> pd.DataFrame:
        """All US bars for one session (BAR_COLUMNS, raw prices)."""

    def tickers(self) -> pd.DataFrame:
        """Reference list (TICKER_COLUMNS), active and recently delisted."""

    def splits(self, start: date, end: date) -> pd.DataFrame:
        """Split events with ex_date in [start, end] (SPLIT_COLUMNS)."""

    def dividends(self, start: date, end: date) -> pd.DataFrame:
        """Cash dividends with ex_date in [start, end] (DIVIDEND_COLUMNS)."""


class FundamentalsProvider(Protocol):
    name: str

    def fundamentals(self, tickers: pd.DataFrame, previous: pd.DataFrame | None = None) -> pd.DataFrame:
        """Sector code and shares outstanding per ticker (FUNDAMENTAL_COLUMNS)."""


def normalise_bars(df: pd.DataFrame) -> pd.DataFrame:
    out = df.reindex(columns=BAR_COLUMNS).copy()
    out["date"] = pd.to_datetime(out["date"]).dt.normalize()
    out["ticker"] = out["ticker"].astype(str)
    for c in ["open", "high", "low", "close", "volume", "vwap"]:
        out[c] = pd.to_numeric(out[c], errors="coerce").astype("float64")
    return out
