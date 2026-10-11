from datetime import datetime, timezone

import pytest

from warrenia_engine.http import HttpClient, ProviderError
from warrenia_engine.logos import INDEX, run_from_env, update_logos
from warrenia_engine.storage import LocalStorage, read_json, write_json

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
NOW = datetime(2026, 10, 12, 6, tzinfo=timezone.utc)


class Resp:
    def __init__(self, status, content=b""):
        self.status_code = status
        self.content = content
        self.headers = {}
        self.text = ""


class Logos:
    """Fake Logo.dev: AAA and BBB have logos, ETF1 has none, BAD returns a non-PNG body."""

    def __init__(self, status_for_all=None):
        self.calls = []
        self.status_for_all = status_for_all

    def request(self, method, url, headers=None, timeout=None, params=None):
        t = url.rsplit("/", 1)[1]
        self.calls.append((t, params))
        if self.status_for_all:
            return Resp(self.status_for_all)
        return {"AAA": Resp(200, PNG), "BBB": Resp(200, PNG), "BAD": Resp(200, b"<svg/>")}.get(t, Resp(404))


def market(tmp_path):
    st = LocalStorage(tmp_path)
    write_json(st, "published/latest.json", {"path": "runs/r1"})
    write_json(st, "published/runs/r1/radar.json.gz", {"rows": [
        {"t": "ETF1", "cls": "etf", "rank": 1}, {"t": "AAA", "cls": "stock", "rank": 2},
        {"t": "BBB", "cls": "stock", "rank": 1}, {"t": "BAD", "cls": "stock", "rank": 3},
    ]})
    return st


def client(fake):
    return HttpClient("logo.dev", session=fake, sleep=lambda s: None, max_retries=0)


def test_fetches_once_and_remembers_missing(tmp_path):
    st, fake = market(tmp_path), Logos()
    out = update_logos(st, "pk_test", now=NOW, http=client(fake))
    assert out["fetched"] == 2 and out["without_logo"] == 2
    assert [t for t, _ in fake.calls][:3] == ["BBB", "AAA", "BAD"]  # stocks first, by rank
    assert fake.calls[0][1] == {"token": "pk_test", "size": 128, "format": "png", "fallback": "404"}
    assert st.read_bytes("published/logos/AAA.png") == PNG
    assert st.read_bytes("published/logos/BAD.png") is None  # not an image: never stored
    idx = read_json(st, INDEX)
    assert idx["have"] == ["AAA", "BBB"] and set(idx["missing"]) == {"ETF1", "BAD"}

    fake.calls.clear()
    update_logos(st, "pk_test", now=NOW, http=client(fake))
    assert fake.calls == []  # nothing new to fetch

    update_logos(st, "pk_test", now=datetime(2026, 11, 20, tzinfo=timezone.utc), http=client(fake))
    assert sorted(t for t, _ in fake.calls) == ["BAD", "ETF1"]  # misses retried after 30 days


def test_budget_limits_requests(tmp_path):
    st, fake = market(tmp_path), Logos()
    out = update_logos(st, "pk_test", now=NOW, budget=1, http=client(fake))
    assert len(fake.calls) == 1 and out["pending"] == 3


def test_bad_token_fails_loudly(tmp_path):
    with pytest.raises(ProviderError):
        update_logos(market(tmp_path), "pk_wrong", now=NOW, http=client(Logos(status_for_all=401)))


def test_env_guards(tmp_path, monkeypatch):
    st = market(tmp_path)
    monkeypatch.delenv("LOGO_DEV_TOKEN", raising=False)
    assert "skipped" in run_from_env(st)
    monkeypatch.setenv("LOGO_DEV_TOKEN", "sk_secret")
    with pytest.raises(SystemExit):
        run_from_env(st)
