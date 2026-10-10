from datetime import date, datetime, timezone

import pandas as pd
import pytest
import requests

from warrenia_engine.calendar import is_stale, last_closed_session
from warrenia_engine.http import HttpClient, ProviderError, RateLimited
from warrenia_engine.storage import LocalStorage, read_json, write_json
from warrenia_engine.universe import classify_assets, eligibility


def test_last_closed_session_weekend_and_holiday():
    # Saturday 2026-10-10 -> Friday 2026-10-09
    assert last_closed_session(datetime(2026, 10, 10, 12, tzinfo=timezone.utc)).session == date(2026, 10, 9)
    # Friday before the close (14:00 UTC) -> Thursday
    assert last_closed_session(datetime(2026, 10, 9, 14, tzinfo=timezone.utc)).session == date(2026, 10, 8)
    # Day after Thanksgiving 2026-11-27 morning -> Wednesday 25th (26th is a holiday)
    assert last_closed_session(datetime(2026, 11, 27, 10, tzinfo=timezone.utc)).session == date(2026, 11, 25)


def test_staleness():
    now = datetime(2026, 10, 13, 23, tzinfo=timezone.utc)  # Tuesday night
    assert is_stale(date(2026, 10, 9), now)
    assert not is_stale(date(2026, 10, 13), now)


class FakeResp:
    def __init__(self, status, payload=None, headers=None):
        self.status_code = status
        self._p = payload
        self.headers = headers or {}
        self.text = str(payload)

    def json(self):
        return self._p


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    def request(self, *a, **k):
        self.calls += 1
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def test_http_retries_rate_limit_then_succeeds():
    s = FakeSession([FakeResp(429), FakeResp(503), FakeResp(200, {"ok": 1})])
    c = HttpClient("t", session=s, sleep=lambda _: None)
    assert c.get_json("https://x/y?apiKey=secret") == {"ok": 1}
    assert s.calls == 3


def test_http_gives_up_and_hides_secrets():
    s = FakeSession([FakeResp(429)] * 3)
    c = HttpClient("t", session=s, sleep=lambda _: None, max_retries=2)
    with pytest.raises(RateLimited) as e:
        c.get_json("https://x/y?apiKey=secret")
    assert "secret" not in str(e.value)


def test_http_auth_error_not_retried():
    s = FakeSession([FakeResp(403, {"status": "NOT_AUTHORIZED"})])
    c = HttpClient("t", session=s, sleep=lambda _: None)
    with pytest.raises(ProviderError) as e:
        c.get_json("https://x")
    assert e.value.status == 403 and s.calls == 1


def test_http_network_error_retried():
    s = FakeSession([requests.ConnectionError("boom"), FakeResp(200, [])])
    c = HttpClient("t", session=s, sleep=lambda _: None)
    assert c.get_json("https://x") == []


def test_local_storage_roundtrip_and_traversal(tmp_path):
    s = LocalStorage(tmp_path)
    write_json(s, "a/b.json.gz", {"x": 1})
    assert read_json(s, "a/b.json.gz") == {"x": 1}
    assert read_json(s, "missing.json") is None
    with pytest.raises(ValueError):
        s.read_bytes("../etc/passwd")


def test_nan_is_never_serialised(tmp_path):
    s = LocalStorage(tmp_path)
    with pytest.raises(ValueError):
        write_json(s, "x.json", {"v": float("nan")})


def test_eligibility_reasons_and_leveraged_regex(cfg):
    tickers = pd.DataFrame([
        {"ticker": "GOOD", "name": "Good Co", "type": "CS", "exchange": "XNAS"},
        {"ticker": "PEN", "name": "Penny", "type": "CS", "exchange": "XNYS"},
        {"ticker": "LEV", "name": "ProShares UltraPro QQQ", "type": "ETF", "exchange": "ARCX"},
        {"ticker": "TQQ", "name": "Direxion Daily 3X Bull", "type": "ETF", "exchange": "ARCX"},
        {"ticker": "SHY", "name": "iShares 1-3 Year Short-Term Treasury Bond ETF", "type": "ETF", "exchange": "ARCX"},
        {"ticker": "WRT", "name": "Some Warrant", "type": "WARRANT", "exchange": "XNAS"},
    ])
    cls = classify_assets(tickers, cfg.universe)
    assert cls["WRT"] is None or pd.isna(cls["WRT"])
    base = dict(present=True, price=50.0, history_sessions=400, missing_frac=0.0, bad_ticks=0, adv_63=5e8)
    ind = pd.DataFrame({tk: base for tk in ["GOOD", "PEN", "LEV", "TQQ", "SHY"]}).T
    ind.loc["PEN", "price"] = 3.0
    names = tickers.set_index("ticker")["name"]
    mcap = pd.Series({"GOOD": 5e9, "PEN": 5e9})
    el = eligibility(ind, cls, names, mcap, cfg.universe)
    assert el.loc["GOOD", "eligible"]
    assert "price" in el.loc["PEN", "reasons"]
    assert "leveraged" in el.loc["LEV", "reasons"] and "leveraged" in el.loc["TQQ", "reasons"]
    assert el.loc["SHY", "eligible"]
