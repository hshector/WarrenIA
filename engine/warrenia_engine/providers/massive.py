"""Massive (formerly Polygon.io) adapter — US stocks & ETFs, end-of-day.

Free "Basic" plan (verify current terms at massive.com/pricing): 5 requests/min,
EOD data, ~2 years of history. The grouped-daily endpoint returns every US ticker
for one session in a single call, which makes a 2-year backfill ~520 calls (~1h45m
at 5/min) and daily updates a handful of calls.

We request RAW (unadjusted) bars and fetch split/dividend events separately so the
engine computes adjustments itself (reproducible, and robust to incremental loads).
"""

from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from urllib.parse import urlencode

import pandas as pd

from ..http import HttpClient, ProviderError
from .base import BAR_COLUMNS, DIVIDEND_COLUMNS, SPLIT_COLUMNS, TICKER_COLUMNS, empty, normalise_bars

log = logging.getLogger(__name__)


class MassiveProvider:
    name = "massive"
    demo = False
    total_return = True

    def __init__(self, api_key: str, base_url: str = "https://api.polygon.io", min_interval: float = 12.5,
                 history_years: int = 2, http: HttpClient | None = None):
        if not api_key:
            raise ProviderError("MASSIVE_API_KEY no configurada")
        self.key = api_key
        self.base = base_url.rstrip("/")
        self.history_years = history_years
        self.http = http or HttpClient("massive", min_interval=min_interval, max_retries=5, backoff_base=3.0)

    @classmethod
    def from_env(cls) -> "MassiveProvider":
        return cls(
            api_key=os.environ.get("MASSIVE_API_KEY", ""),
            base_url=os.environ.get("MASSIVE_BASE_URL", "https://api.polygon.io"),
            min_interval=float(os.environ.get("MASSIVE_MIN_INTERVAL", "12.5")),
            history_years=int(os.environ.get("MASSIVE_HISTORY_YEARS", "2")),
        )

    def _url(self, path: str, **params) -> str:
        params = {k: v for k, v in params.items() if v is not None}
        params["apiKey"] = self.key
        return f"{self.base}{path}?{urlencode(params)}"

    def _paged(self, path: str, **params) -> list[dict]:
        out: list[dict] = []
        url = self._url(path, **params)
        pages = 0
        while url:
            data = self.http.get_json(url)
            out.extend(data.get("results") or [])
            nxt = data.get("next_url")
            url = f"{nxt}&apiKey={self.key}" if nxt else None
            pages += 1
            if pages > 400:
                raise ProviderError("massive: paginación anómala (>400 páginas)")
        return out

    # ---------------------------------------------------------------- API
    def earliest_available(self, today: date) -> date | None:
        # A few days of margin inside the plan window.
        return date(today.year - self.history_years, today.month, min(today.day, 28)) + timedelta(days=5)

    def grouped_daily(self, session: date) -> pd.DataFrame:
        data = self.http.get_json(self._url(
            f"/v2/aggs/grouped/locale/us/market/stocks/{session.isoformat()}", adjusted="false", include_otc="false"))
        if data.get("status") not in ("OK", "DELAYED", None):
            raise ProviderError(f"massive: estado inesperado {data.get('status')}")
        res = data.get("results") or []
        if not res:
            return pd.DataFrame(columns=BAR_COLUMNS)
        df = pd.DataFrame(res)
        out = pd.DataFrame({
            "date": pd.Timestamp(session), "ticker": df["T"], "open": df.get("o"), "high": df.get("h"),
            "low": df.get("l"), "close": df.get("c"), "volume": df.get("v"), "vwap": df.get("vw"),
        })
        out = normalise_bars(out)
        # Basic validation: drop impossible bars instead of storing them.
        bad = (out["close"] <= 0) | out["close"].isna() | (out["high"] < out["low"])
        if bad.any():
            log.warning("massive: %d invalid bars dropped on %s", int(bad.sum()), session)
        return out[~bad]

    def tickers(self) -> pd.DataFrame:
        rows: list[dict] = []
        for kind in ("CS", "ADRC", "ETF"):
            for active in ("true", "false"):
                res = self._paged("/v3/reference/tickers", market="stocks", type=kind, active=active, limit=1000)
                rows.extend(res)
                log.info("massive: tickers type=%s active=%s -> %d", kind, active, len(res))
        if not rows:
            return empty(TICKER_COLUMNS)
        df = pd.DataFrame(rows)
        out = pd.DataFrame({
            "ticker": df["ticker"], "name": df.get("name"), "type": df.get("type"),
            "exchange": df.get("primary_exchange"), "active": df.get("active").astype(bool),
            "cik": df.get("cik"), "currency": df.get("currency_name", pd.Series("usd")).str.upper(),
        })
        # Active rows win over historical ones for the same symbol.
        return out.sort_values("active").drop_duplicates("ticker", keep="last").reset_index(drop=True)

    def splits(self, start: date, end: date) -> pd.DataFrame:
        res = self._paged("/v3/reference/splits", **{"execution_date.gte": start.isoformat(),
                                                     "execution_date.lte": end.isoformat(), "limit": 1000})
        if not res:
            return empty(SPLIT_COLUMNS)
        df = pd.DataFrame(res)
        return pd.DataFrame({"ticker": df["ticker"], "ex_date": pd.to_datetime(df["execution_date"]).dt.date,
                             "split_from": df["split_from"].astype(float), "split_to": df["split_to"].astype(float)})

    def dividends(self, start: date, end: date) -> pd.DataFrame:
        res = self._paged("/v3/reference/dividends", **{"ex_dividend_date.gte": start.isoformat(),
                                                        "ex_dividend_date.lte": end.isoformat(), "limit": 1000})
        if not res:
            return empty(DIVIDEND_COLUMNS)
        df = pd.DataFrame(res)
        df = df[df["cash_amount"].notna() & (df["cash_amount"] > 0)]
        return pd.DataFrame({"ticker": df["ticker"], "ex_date": pd.to_datetime(df["ex_dividend_date"]).dt.date,
                             "cash_amount": df["cash_amount"].astype(float),
                             "currency": df.get("currency", pd.Series("USD", index=df.index)).fillna("USD").str.upper()})
