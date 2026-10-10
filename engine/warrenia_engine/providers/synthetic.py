"""Synthetic market for development, tests and the demo mode.

Generates a reproducible, *clearly fake* US-like market (tickers X001..., names
"Demo ...") on the real NYSE calendar, including the edge cases the pipeline must
handle: splits, dividends, bad ticks, stale tickers, recent IPOs, penny stocks,
illiquid names, leveraged ETFs and missing sessions. Every artifact produced from
it is flagged `demo: true` and the UI shows a DEMO banner.
"""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd

from ..calendar import previous_sessions
from .base import BAR_COLUMNS, DIVIDEND_COLUMNS, FUNDAMENTAL_COLUMNS, SPLIT_COLUMNS, TICKER_COLUMNS

SECTORS = {
    "Technology": ("XLK", 7372),
    "Communication": ("XLC", 4813),
    "Consumer Discretionary": ("XLY", 5651),
    "Consumer Staples": ("XLP", 2080),
    "Energy": ("XLE", 1311),
    "Financials": ("XLF", 6022),
    "Health Care": ("XLV", 2834),
    "Industrials": ("XLI", 3720),
    "Materials": ("XLB", 2800),
    "Real Estate": ("XLRE", 6798),
    "Utilities": ("XLU", 4911),
}


class SyntheticProvider:
    name = "synthetic"
    demo = True
    total_return = True

    def __init__(self, end: date, sessions: int = 540, n_stocks: int = 700, n_etfs: int = 90, seed: int = 42):
        self.end = end
        self.sessions = previous_sessions(end, sessions)
        self.rng = np.random.default_rng(seed)
        self._build(n_stocks, n_etfs)

    # ------------------------------------------------------------------ build
    def _build(self, n_stocks: int, n_etfs: int) -> None:
        rng = self.rng
        T = len(self.sessions)
        dates = pd.to_datetime(self.sessions)

        # Market factor with a mid-sample correction (regime change).
        mkt = rng.normal(0.00045, 0.0095, T)
        c0 = T // 2
        mkt[c0 : c0 + 35] += rng.normal(-0.004, 0.012, 35)
        mkt[c0 + 35 : c0 + 90] += 0.0015

        # Sector factors: slow-moving drifts so sectors take turns leading.
        sec_names = list(SECTORS)
        sec_drift = np.zeros((T, len(sec_names)))
        d = rng.normal(0, 0.0004, len(sec_names))
        for t in range(T):
            d = 0.995 * d + rng.normal(0, 0.00006, len(sec_names))
            sec_drift[t] = d
        sec_ret = sec_drift + rng.normal(0, 0.006, (T, len(sec_names)))

        rows: list[dict] = []
        tickers: list[dict] = []
        fundamentals: list[dict] = []
        splits: list[dict] = []
        dividends: list[dict] = []

        def emit(ticker: str, rets: np.ndarray, p0: float, dollar_vol: float, start: int = 0,
                 stop: int | None = None, gap_vol: float = 0.004, jumps: np.ndarray | None = None) -> np.ndarray:
            stop = T if stop is None else stop
            closes = p0 * np.exp(np.cumsum(rets))
            for t in range(start, stop):
                c = closes[t]
                prev = closes[t - 1] if t > 0 else c
                # overnight gaps carry most of the jump (earnings-like events)
                o = prev * np.exp(rng.normal(0, gap_vol) + (0.8 * jumps[t] if jumps is not None else 0.0))
                hi = max(o, c) * (1 + abs(rng.normal(0, 0.006)))
                lo = min(o, c) * (1 - abs(rng.normal(0, 0.006)))
                vol = max(dollar_vol * np.exp(rng.normal(0, 0.35)) / c, 100.0)
                rows.append({"date": dates[t], "ticker": ticker, "open": o, "high": hi, "low": lo,
                             "close": c, "volume": vol, "vwap": (hi + lo + c) / 3})
            return closes

        # Benchmarks and sector ETFs.
        bench = {"SPY": (mkt, 560.0), "RSP": (mkt * 0.95 + rng.normal(0, 0.002, T), 170.0),
                 "QQQ": (mkt * 1.2 + sec_ret[:, 0] * 0.4, 480.0), "MDY": (mkt * 1.1 + rng.normal(0, 0.003, T), 540.0)}
        for tk, (r, p0) in bench.items():
            emit(tk, r, p0, 8e9, gap_vol=0.002)
            tickers.append(self._ticker(tk, f"Demo Benchmark {tk}", "ETF", "ARCX"))
        for j, (sname, (etf, _)) in enumerate(SECTORS.items()):
            emit(etf, mkt + sec_ret[:, j], float(rng.uniform(40, 200)), 1.5e9, gap_vol=0.002)
            tickers.append(self._ticker(etf, f"Demo Sector {sname}", "ETF", "ARCX"))

        # Stocks.
        for i in range(n_stocks):
            tk = f"X{i + 1:03d}"
            j = int(rng.integers(len(sec_names)))
            sname = sec_names[j]
            beta = rng.uniform(0.6, 1.6)
            idio = rng.uniform(0.008, 0.035)
            alpha = np.zeros(T)
            a = rng.normal(0, 0.0008)
            for t in range(T):
                a = 0.993 * a + rng.normal(0, 0.00012)
                alpha[t] = a
            jumps = (rng.random(T) < 1 / 63) * rng.normal(0, 0.06, T)
            r = beta * mkt + sec_ret[:, j] + alpha + rng.normal(0, idio, T) + jumps
            mcap = float(np.exp(rng.normal(np.log(12e9), 1.4)))
            p0 = float(np.exp(rng.normal(np.log(60), 0.8)))
            dvol = mcap * float(rng.uniform(0.002, 0.012))
            start, stop = 0, None
            kind = "CS" if rng.random() > 0.08 else "ADRC"
            if i == 3:  # penny stock
                p0 = 2.0
            if i == 5:  # illiquid
                dvol = 2e6
            if i == 7:  # recent IPO
                start = T - 150
            if i == 9:  # stale: stopped trading 10 sessions ago
                stop = T - 10
            closes = emit(tk, r, p0, dvol, start=start, stop=stop, jumps=jumps)
            shares = mcap / closes[-1]
            if i == 11:  # unknown shares outstanding (e.g. foreign filer)
                shares = None
            tickers.append(self._ticker(tk, f"Demo {sname} {i + 1:03d}", kind, "XNAS" if i % 2 else "XNYS"))
            fundamentals.append({"ticker": tk, "cik": f"{900000 + i:010d}", "sic": SECTORS[sname][1],
                                 "sic_description": f"Demo SIC {SECTORS[sname][1]}", "shares": shares,
                                 "shares_asof": dates[-60].date(), "source": "synthetic"})
            if rng.random() < 0.4:  # quarterly dividends
                for t in range(max(start, 30), stop or T, 63):
                    dividends.append({"ticker": tk, "ex_date": dates[t].date(),
                                      "cash_amount": round(closes[t - 1] * 0.006, 4), "currency": "USD"})
        # Missing sessions for one ticker (data gap).
        rows = [r for r in rows if not (r["ticker"] == "X013" and dates[-200] <= r["date"] <= dates[-180])]
        # Bad tick: one-day spike that reverses.
        for r in rows:
            if r["ticker"] == "X015" and r["date"] == dates[-40]:
                r["close"] *= 1.6
                r["high"] = max(r["high"], r["close"])
        # 4-for-1 split on X017: raw prices before ex_date are 4x higher.
        split_t = T - 120
        for r in rows:
            if r["ticker"] == "X017" and r["date"] < dates[split_t]:
                for c in ("open", "high", "low", "close", "vwap"):
                    r[c] *= 4.0
                r["volume"] /= 4.0
        splits.append({"ticker": "X017", "ex_date": dates[split_t].date(), "split_from": 1.0, "split_to": 4.0})

        # ETFs (including leveraged/inverse ones that must be excluded).
        for k in range(n_etfs):
            tk = f"E{k + 1:03d}"
            w = rng.dirichlet(np.ones(len(sec_names)) * 0.5)
            r = mkt * rng.uniform(0.7, 1.1) + sec_ret @ w + rng.normal(0, 0.003, T)
            name = f"Demo {sec_names[int(np.argmax(w))]} Tilt ETF"
            dvol = float(np.exp(rng.normal(np.log(60e6), 1.3)))
            if k % 15 == 0:
                r = 3 * mkt
                name = "Demo Daily 3X Bull ETF"
            elif k % 15 == 1:
                r = -1 * mkt
                name = "Demo Inverse Market ETF"
            elif k % 15 == 2:
                name = "Demo Short-Term Treasury ETF"
                r = rng.normal(0.00015, 0.0008, T)
            emit(tk, r, float(rng.uniform(20, 300)), dvol, gap_vol=0.002)
            tickers.append(self._ticker(tk, name, "ETF", "ARCX"))

        self._bars = pd.DataFrame(rows, columns=BAR_COLUMNS)
        self._tickers = pd.DataFrame(tickers, columns=TICKER_COLUMNS)
        self._fund = pd.DataFrame(fundamentals, columns=FUNDAMENTAL_COLUMNS)
        self._splits = pd.DataFrame(splits, columns=SPLIT_COLUMNS)
        self._divs = pd.DataFrame(dividends, columns=DIVIDEND_COLUMNS)
        self._by_date = {d: g for d, g in self._bars.groupby("date")}

    @staticmethod
    def _ticker(tk: str, name: str, kind: str, exch: str) -> dict:
        return {"ticker": tk, "name": name, "type": kind, "exchange": exch, "active": True, "cik": None, "currency": "USD"}

    # ------------------------------------------------------------- interface
    def earliest_available(self, today: date) -> date | None:
        return self.sessions[0]

    def grouped_daily(self, session: date) -> pd.DataFrame:
        g = self._by_date.get(pd.Timestamp(session))
        return g.copy() if g is not None else pd.DataFrame(columns=BAR_COLUMNS)

    def tickers(self) -> pd.DataFrame:
        return self._tickers.copy()

    def splits(self, start: date, end: date) -> pd.DataFrame:
        s = self._splits
        return s[(s.ex_date >= start) & (s.ex_date <= end)].copy()

    def dividends(self, start: date, end: date) -> pd.DataFrame:
        d = self._divs
        return d[(d.ex_date >= start) & (d.ex_date <= end)].copy()

    def fundamentals(self, tickers: pd.DataFrame, previous: pd.DataFrame | None = None) -> pd.DataFrame:
        return self._fund.copy()
