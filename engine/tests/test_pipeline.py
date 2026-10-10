"""End-to-end on a small synthetic market: ingest -> compute -> publish."""

from datetime import datetime, timezone

import pytest

from warrenia_engine.calendar import last_closed_session
from warrenia_engine.lake import Lake
from warrenia_engine.pipeline import compute_and_publish, ingest
from warrenia_engine.providers.synthetic import SyntheticProvider
from warrenia_engine.storage import LocalStorage, read_json

from .conftest import NOW


@pytest.fixture(scope="module")
def published(tmp_path_factory):
    from warrenia_engine.config import load_config

    cfg = load_config()
    cfg = cfg.with_overrides({"rank_history": {"daily_sessions": 3, "weekly_back": 30},
                              "sensitivity": {"samples": 50}})
    root = tmp_path_factory.mktemp("lake")
    storage = LocalStorage(root)
    prov = SyntheticProvider(end=last_closed_session(NOW).session, sessions=330, n_stocks=160, n_etfs=30, seed=3)
    s1 = ingest(prov, Lake(storage), cfg, now=NOW, fundamentals_provider=prov)
    s2 = ingest(prov, Lake(storage), cfg, now=NOW, fundamentals_provider=prov)
    out = compute_and_publish(storage, cfg, now=NOW, demo=True, provider_name="synthetic (DEMO)")
    return storage, s1, s2, out, cfg, prov


def test_ingest_is_incremental(published):
    _, s1, s2, *_ = published
    assert s1["fetched"] == 330
    assert s2["fetched"] == 0 and s2["missing_before"] == 0


def test_latest_pointer_and_demo_flag(published):
    storage, *_ , out, cfg, prov = published
    latest = read_json(storage, "published/latest.json")
    assert latest["demo"] is True
    assert latest["data_asof"] == "2026-10-09"
    assert latest["run_id"] == out["run_id"]
    meta = read_json(storage, f"published/{latest['path']}/meta.json")
    assert meta["methodology"]["config_hash"] == cfg.hash
    assert meta["session_close_utc"].startswith("2026-10-09T20:00")
    assert meta["coverage"]["stock"]["eligible"] > 50


def test_radar_rows_are_consistent(published):
    storage, *_ = published
    latest = read_json(storage, "published/latest.json")
    radar = read_json(storage, f"published/{latest['path']}/radar.json.gz")
    stocks = sorted((r for r in radar["rows"] if r["cls"] == "stock"), key=lambda r: r["rank"])
    assert [r["rank"] for r in stocks] == list(range(1, len(stocks) + 1))
    ovs = [r["ov"] for r in stocks]
    assert ovs == sorted(ovs, reverse=True)
    for r in stocks:
        for k in ("m", "tq", "a", "rk", "ov"):
            assert 0 <= r[k] <= 100
        assert r["st"] in {"strong", "improving", "breakout", "extended", "weakening", "speculative", "neutral"}
    tickers = {r["t"] for r in radar["rows"]}
    # Edge cases from the synthetic market are excluded with explicit reasons
    excluded = read_json(storage, f"published/{latest['path']}/excluded.json.gz")
    ex = {e["t"]: e["codes"] for e in excluded}
    assert "price" in ex["X004"]
    assert "history" in ex["X008"]
    assert "stale" in ex["X010"]
    assert "bad_tick" in ex["X015"]
    assert not {"X004", "X008", "X010", "X015"} & tickers
    lev = [e for e in excluded if "leveraged" in e["codes"]]
    assert lev and all(e["cls"] == "etf" for e in lev)


def test_split_ticker_has_no_artificial_crash(published):
    storage, *_ = published
    latest = read_json(storage, "published/latest.json")
    shard = read_json(storage, f"published/{latest['path']}/assets/X.json.gz")
    c = [x for x in shard["X017"]["series"]["c"] if x is not None]
    rets = [b / a - 1 for a, b in zip(c, c[1:])]
    assert min(rets) > -0.5


def test_stale_data_is_flagged(published):
    storage, *_, cfg, prov = published
    later = datetime(2026, 10, 14, 23, tzinfo=timezone.utc)  # two sessions later, no new ingest
    out = compute_and_publish(storage, cfg, now=later, demo=True)
    assert out["status"] == "degraded"
    assert any("última sesión cerrada" in w for w in out["warnings"])
