from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from warrenia_engine.config import load_config
from warrenia_engine.panels import build_panels


@pytest.fixture(scope="session")
def cfg():
    return load_config()


# A fixed "now" keeps tests independent of the wall clock.
NOW = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def now():
    return NOW


def make_bars(closes: dict[str, np.ndarray], dates: pd.DatetimeIndex, volume: float = 1e6) -> pd.DataFrame:
    rows = []
    for tk, c in closes.items():
        for d, v in zip(dates, c):
            if np.isnan(v):
                continue
            rows.append({"date": d, "ticker": tk, "open": v, "high": v * 1.005, "low": v * 0.995,
                         "close": v, "volume": volume, "vwap": v})
    return pd.DataFrame(rows)


@pytest.fixture
def dates():
    return pd.bdate_range("2024-01-01", periods=400)


@pytest.fixture
def simple_panels(dates):
    """SPY trending up; A = 2x SPY returns; B flat; C random."""
    rng = np.random.default_rng(0)
    rm = rng.normal(0.0004, 0.01, len(dates))
    spy = 100 * np.exp(np.cumsum(rm))
    a = 50 * np.exp(np.cumsum(2 * rm))
    b = np.full(len(dates), 20.0)
    c = 30 * np.exp(np.cumsum(rng.normal(0, 0.02, len(dates))))
    bars = make_bars({"SPY": spy, "A": a, "B": b, "C": c}, dates)
    return build_panels(bars, None, None), rm
