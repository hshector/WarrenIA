"""Adapters parse documented response formats; no network access."""

from datetime import date

import pandas as pd

from warrenia_engine.http import HttpClient
from warrenia_engine.portfolio_prices import fetch_ecb
from warrenia_engine.providers.massive import MassiveProvider
from warrenia_engine.providers.sec import SecFundamentals, _annual_frames, _recent_frames

from .test_infra import FakeResp


class Router:
    """Fake requests.Session routing by URL substring."""

    def __init__(self, routes):
        self.routes = routes
        self.urls = []

    def request(self, method, url, **kw):
        self.urls.append(url)
        for key, resp in self.routes:
            if key in url:
                return resp(url) if callable(resp) else resp
        return FakeResp(404, {"error": "not found"})


def massive(routes):
    r = Router(routes)
    return MassiveProvider("KEY", http=HttpClient("m", session=r, sleep=lambda _: None)), r


def test_grouped_daily_parses_and_drops_invalid_bars():
    payload = {"status": "OK", "resultsCount": 3, "results": [
        {"T": "AAPL", "o": 10, "h": 11, "l": 9, "c": 10.5, "v": 1e6, "vw": 10.2, "t": 0},
        {"T": "BAD", "o": 1, "h": 1, "l": 1, "c": 0, "v": 10, "vw": 1, "t": 0},
        {"T": "INV", "o": 1, "h": 1, "l": 2, "c": 1.5, "v": 10, "vw": 1, "t": 0}]}
    p, r = massive([("grouped", FakeResp(200, payload))])
    df = p.grouped_daily(date(2026, 10, 9))
    assert list(df["ticker"]) == ["AAPL"]
    assert df.iloc[0]["close"] == 10.5 and df.iloc[0]["date"] == pd.Timestamp("2026-10-09")
    assert "adjusted=false" in r.urls[0]


def test_grouped_daily_holiday_returns_empty():
    p, _ = massive([("grouped", FakeResp(200, {"status": "OK", "resultsCount": 0}))])
    assert p.grouped_daily(date(2026, 12, 25)).empty


def test_tickers_follow_pagination_and_prefer_active():
    def tick(url):
        if "cursor=abc" in url:
            return FakeResp(200, {"results": [{"ticker": "OLD", "name": "Old", "type": "CS", "active": False,
                                               "primary_exchange": "XNYS", "cik": "1", "currency_name": "usd"}]})
        if "type=CS" in url and "active=true" in url:
            return FakeResp(200, {"results": [{"ticker": "AAA", "name": "A", "type": "CS", "active": True,
                                               "primary_exchange": "XNAS", "cik": "2", "currency_name": "usd"}],
                                  "next_url": "https://api.polygon.io/v3/reference/tickers?cursor=abc"})
        return FakeResp(200, {"results": []})
    p, r = massive([("/v3/reference/tickers", tick)])
    df = p.tickers()
    assert set(df["ticker"]) == {"AAA", "OLD"}
    assert any("cursor=abc" in u and "apiKey=KEY" in u for u in r.urls)


def test_splits_and_dividends():
    p, _ = massive([
        ("/v3/reference/splits", FakeResp(200, {"results": [
            {"ticker": "NVDA", "execution_date": "2024-06-10", "split_from": 1, "split_to": 10}]})),
        ("/v3/reference/dividends", FakeResp(200, {"results": [
            {"ticker": "KO", "ex_dividend_date": "2026-09-15", "cash_amount": 0.51, "currency": "USD"},
            {"ticker": "ZZ", "ex_dividend_date": "2026-09-15", "cash_amount": 0, "currency": "USD"}]})),
    ])
    s = p.splits(date(2024, 1, 1), date(2026, 1, 1))
    assert s.iloc[0]["split_to"] == 10.0 and s.iloc[0]["ex_date"] == date(2024, 6, 10)
    d = p.dividends(date(2026, 1, 1), date(2026, 12, 1))
    assert list(d["ticker"]) == ["KO"]


def test_massive_plan_window():
    p, _ = massive([])
    assert p.earliest_available(date(2026, 10, 10)) == date(2024, 10, 15)


def test_sec_frames_pick_latest_and_sic_cached():
    assert _recent_frames(date(2026, 10, 10))[:2] == ["CY2026Q4I", "CY2026Q3I"]
    routes = [
        ("company_tickers_exchange", FakeResp(200, {"fields": ["cik", "name", "ticker", "exchange"],
                                                     "data": [[320193, "Apple", "AAPL", "Nasdaq"],
                                                              [1067983, "Berkshire", "BRK-B", "NYSE"]]})),
        ("CY2026Q3I", FakeResp(200, {"data": [{"cik": 320193, "end": "2026-07-20", "val": 1.5e10}]})),
        ("CY2026Q2I", FakeResp(200, {"data": [{"cik": 320193, "end": "2026-04-20", "val": 1.6e10},
                                               {"cik": 1067983, "end": "2026-04-20", "val": 2.1e9}]})),
        ("CIK0001067983", FakeResp(200, {"sic": "6331", "sicDescription": "Insurance"})),
    ]
    r = Router(routes)
    sec = SecFundamentals("WarrenIA test@example.com", http=HttpClient("s", session=r, sleep=lambda _: None),
                          today=date(2026, 10, 10))
    tickers = pd.DataFrame([{"ticker": "AAPL", "type": "CS", "active": True},
                            {"ticker": "BRK.B", "type": "CS", "active": True}])
    prev = pd.DataFrame([{"ticker": "AAPL", "cik": "0000320193", "sic": 3571, "sic_description": "Computers"}])
    f = sec.fundamentals(tickers, previous=prev).set_index("ticker")
    assert f.loc["AAPL", "shares"] == 1.5e10 and f.loc["AAPL", "shares_asof"] == "2026-07-20"
    assert f.loc["BRK.B", "sic"] == 6331
    assert not any("CIK0000320193" in u for u in r.urls)  # SIC reused from cache


def test_ecb_csv_parsing():
    csv = ("KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE\n"
           "EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-08,1.0912\n"
           "EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-09,1.0950\n")
    resp = FakeResp(200, None)
    resp.text = csv
    r = Router([("data-api.ecb.europa.eu", resp)])
    df = fetch_ecb(["USD"], date(2026, 10, 1), http=HttpClient("e", session=r, sleep=lambda _: None))
    assert list(df["rate"]) == [1.0912, 1.0950]


def test_sec_net_income_prefers_newest_fiscal_year_and_net_income_tag():
    assert _annual_frames(date(2026, 10, 10)) == ["CY2026", "CY2025", "CY2024"]
    routes = [
        ("company_tickers_exchange", FakeResp(200, {"fields": ["cik", "name", "ticker", "exchange"],
                                                     "data": [[1, "A", "AAA", "NYSE"], [2, "B", "BBB", "NYSE"],
                                                              [3, "C", "CCC", "NYSE"]]})),
        ("NetIncomeLoss/USD/CY2025.", FakeResp(200, {"data": [{"cik": 1, "end": "2025-12-31", "val": 5e8},
                                                               {"cik": 2, "end": "2025-09-30", "val": -2e8}]})),
        ("NetIncomeLoss/USD/CY2024.", FakeResp(200, {"data": [{"cik": 1, "end": "2024-12-31", "val": 9e8}]})),
        ("ProfitLoss/USD/CY2025.", FakeResp(200, {"data": [{"cik": 1, "end": "2025-12-31", "val": 7e8},
                                                            {"cik": 3, "end": "2025-12-31", "val": 1e8}]})),
        ("ProfitLoss/USD/CY2024.", FakeResp(500, {"error": "boom"})),  # informative: never fatal
        ("CIK", FakeResp(200, {"sic": "3571", "sicDescription": "x"})),
    ]
    r = Router(routes)
    sec = SecFundamentals("WarrenIA test@example.com",
                          http=HttpClient("s", session=r, sleep=lambda _: None, max_retries=0),
                          today=date(2026, 10, 10))
    tickers = pd.DataFrame([{"ticker": t, "type": "CS", "active": True} for t in ("AAA", "BBB", "CCC")])
    f = sec.fundamentals(tickers).set_index("ticker")
    assert f.loc["AAA", "net_income"] == 5e8 and f.loc["AAA", "net_income_end"] == "2025-12-31"
    assert f.loc["BBB", "net_income"] == -2e8
    assert f.loc["CCC", "net_income"] == 1e8  # ProfitLoss only when NetIncomeLoss is absent
