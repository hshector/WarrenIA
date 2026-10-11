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
from ..fundamentals import FACT_COLUMNS
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
        self.seed = seed
        self.rng_fund = np.random.default_rng(seed + 1)  # separate stream: price paths stay unchanged
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
        facts: list[tuple] = []
        splits: list[dict] = []
        dividends: list[dict] = []

        def emit(ticker: str, rets: np.ndarray, p0: float, dollar_vol: float, start: int = 0,
                 stop: int | None = None, gap_vol: float = 0.004, jumps: np.ndarray | None = None,
                 gen: np.random.Generator | None = None) -> np.ndarray:
            g = gen or rng
            stop = T if stop is None else stop
            closes = p0 * np.exp(np.cumsum(rets))
            for t in range(start, stop):
                c = closes[t]
                prev = closes[t - 1] if t > 0 else c
                # overnight gaps carry most of the jump (earnings-like events)
                o = prev * np.exp(g.normal(0, gap_vol) + (0.8 * jumps[t] if jumps is not None else 0.0))
                hi = max(o, c) * (1 + abs(g.normal(0, 0.006)))
                lo = min(o, c) * (1 - abs(g.normal(0, 0.006)))
                vol = max(dollar_vol * np.exp(g.normal(0, 0.35)) / c, 100.0)
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

        # Asset-class proxies (own random stream: the rest of the demo market stays identical).
        rp = np.random.default_rng(self.seed + 2)
        proxies = {
            "ACWI": (mkt * 0.95 + rp.normal(0.0, 0.002, T), 110.0),
            "URTH": (mkt * 1.0 + rp.normal(0.0, 0.0015, T), 150.0),
            "GLD": (-0.1 * mkt + rp.normal(0.0006, 0.010, T), 230.0),
            "SLV": (0.2 * mkt + rp.normal(0.0005, 0.019, T), 28.0),
            "DBC": (0.3 * mkt + rp.normal(0.0001, 0.011, T), 23.0),
            "IBIT": (1.2 * mkt + rp.normal(0.0012, 0.032, T), 40.0),
            "IEF": (-0.25 * mkt + rp.normal(0.0001, 0.004, T), 95.0),
        }
        for tk, (r, p0) in proxies.items():
            emit(tk, r, p0, 2e9, gap_vol=0.002, gen=rp)
            tickers.append(self._ticker(tk, f"Demo Proxy {tk}", "ETF", "ARCX"))

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
            # Last fiscal-year net income: P/E ~ lognormal around 22; ~12% of companies lose money.
            rf = self.rng_fund
            ni = mcap / float(np.exp(rf.normal(np.log(22), 0.6)))
            if rf.random() < 0.12:
                ni = -mcap * float(rf.uniform(0.01, 0.08))
            if i == 11:
                ni = None  # IFRS / foreign filer: unknown
            if ni is not None and shares is not None:
                facts.extend(self._facts(900000 + i, mcap, ni, shares, rf, fy_end=dates[-200]))
            fundamentals.append({"ticker": tk, "cik": f"{900000 + i:010d}", "sic": SECTORS[sname][1],
                                 "sic_description": f"Demo SIC {SECTORS[sname][1]}", "shares": shares,
                                 "shares_asof": dates[-60].date(), "net_income": ni,
                                 "net_income_end": dates[-200].date().isoformat() if ni is not None else None,
                                 "source": "synthetic"})
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
        self._facts = pd.DataFrame(facts, columns=FACT_COLUMNS)
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

    def facts(self, ciks: set[int] | None = None) -> pd.DataFrame:
        f = self._facts
        return (f[f["cik"].isin(ciks)] if ciks is not None else f).copy()

    @staticmethod
    def _facts(cik: int, mcap: float, ni0: float, shares: float, rf: np.random.Generator, fy_end) -> list[tuple]:
        """Three coherent fiscal years of statements, with deliberate weak, distressed, diluting
        and low-cash-earnings companies so every fundamental rule is exercised by the demo."""
        u = lambda a, b: float(rf.uniform(a, b))  # noqa: E731
        kind = rf.random()
        ends = [pd.Timestamp(fy_end) - pd.DateOffset(years=k) for k in range(4)]  # FY0..FY-3 (balances)
        a3 = mcap * u(0.3, 1.2)
        assets = [a3 * (1.07 ** (3 - k)) * u(0.95, 1.05) for k in range(4)]
        rows: list[tuple] = []

        def add(concept, tag, k_end, val, kind_="dur"):
            e = ends[k_end]
            start = (e - pd.DateOffset(years=1) + pd.Timedelta(days=1)).date().isoformat() if kind_ == "dur" else None
            rows.append((cik, concept, tag, kind_, start, e.date().isoformat(), float(val)))

        turnover, gm = u(0.4, 1.2), u(0.2, 0.7)
        sh_prev = shares * u(0.97, 1.0)
        for k in (0, 1):
            ni = ni0 if k == 0 else ni0 / (1 + rf.normal(0.08, 0.2))
            rev = assets[k + 1] * turnover * (1 if k == 0 else 1 / (1 + u(0.0, 0.15)))
            g = gm * (1 + (u(0.0, 0.05) if k == 0 else 0))
            op = max(ni * 1.3, rev * g * 0.15) if ni > 0 else ni * 1.1
            cfo = ni * u(0.9, 1.6) if ni > 0 else ni * u(0.3, 1.2)
            if kind < 0.06 and k == 0:          # profits not backed by cash (high accruals)
                cfo = -abs(ni) * 0.3
            add("revenue", "Revenues", k, rev)
            add("gross_profit", "GrossProfit", k, rev * g)
            add("operating_income", "OperatingIncomeLoss", k, op)
            add("net_income", "NetIncomeLoss", k, ni)
            add("cfo", "NetCashProvidedByUsedInOperatingActivities", k, cfo)
            add("capex", "PaymentsToAcquirePropertyPlantAndEquipment", k, rev * u(0.02, 0.08))
            sh = shares if k == 0 else sh_prev
            if kind > 0.94 and k == 0:          # heavy dilution
                sh = sh_prev * 1.15
            add("diluted_shares", "WeightedAverageNumberOfDilutedSharesOutstanding", k, sh)
        for k in range(4):
            a = assets[k]
            ca = a * u(0.25, 0.6)
            liab = a * (u(0.85, 0.98) if 0.06 <= kind < 0.10 else u(0.3, 0.7))   # distressed balance sheets
            eq = a - liab
            add("assets", "Assets", k, a, "inst")
            add("assets_current", "AssetsCurrent", k, ca, "inst")
            add("liabilities_current", "LiabilitiesCurrent", k, ca / u(0.8, 2.5), "inst")
            add("liabilities", "Liabilities", k, liab, "inst")
            add("equity", "StockholdersEquity", k, eq, "inst")
            add("cash", "CashAndCashEquivalentsAtCarryingValue", k, ca * u(0.2, 0.5), "inst")
            add("retained_earnings", "RetainedEarningsAccumulatedDeficit", k,
                -a * 0.4 if 0.06 <= kind < 0.10 else eq * u(-0.2, 1.0), "inst")
            add("lt_debt_noncurrent", "LongTermDebtNoncurrent", k, liab * u(0.1, 0.6), "inst")
        return rows

    def ticker_details(self, ticker: str) -> dict:
        row = self._tickers[self._tickers["ticker"] == ticker]
        name = str(row["name"].iloc[0]) if len(row) else ticker
        return {"ticker": ticker, "name": name, "homepage": None, "employees": 1000, "list_date": "2010-01-04",
                "industry": name.replace("Demo ", "").rsplit(" ", 1)[0],
                "description": f"{name} is a fictitious company of the demo market. Real data shows what the "
                               "business does, in a few sentences, from the provider's company profile."}
