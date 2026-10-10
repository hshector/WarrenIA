"""Ingest must survive provider hiccups without losing work or poisoning state."""

from datetime import timedelta

import pandas as pd
import pytest

from warrenia_engine.calendar import last_closed_session, previous_sessions
from warrenia_engine.config import load_config
from warrenia_engine.http import ProviderError
from warrenia_engine.lake import Lake
from warrenia_engine.pipeline import ingest
from warrenia_engine.providers.sec import _int_or_none
from warrenia_engine.providers.synthetic import SyntheticProvider
from warrenia_engine.storage import LocalStorage

from .conftest import NOW


class Flaky(SyntheticProvider):
    def __init__(self, fail: dict, **kw):
        super().__init__(**kw)
        self.fail = fail  # session -> status

    def grouped_daily(self, session):
        if session in self.fail:
            raise ProviderError("boom", self.fail[session])
        return super().grouped_daily(session)


def _setup(tmp_path):
    last = last_closed_session(NOW).session
    return last, Lake(LocalStorage(tmp_path)), load_config()


def test_recent_403_is_retried_not_a_floor(tmp_path):
    last, lake, cfg = _setup(tmp_path)
    prov = Flaky({last: 403}, end=last, sessions=400, n_stocks=30, n_etfs=5)
    out = ingest(prov, lake, cfg, now=NOW, history_sessions=40)
    assert "plan_limited_before" not in lake.state()
    assert last.isoformat() in out["empty"]
    assert out["fetched"] == 39


def test_old_403_sets_floor(tmp_path):
    last, lake, cfg = _setup(tmp_path)
    old = previous_sessions(last, 300)[0]
    prov = Flaky({old: 403}, end=last, sessions=400, n_stocks=30, n_etfs=5)
    ingest(prov, lake, cfg, now=NOW, history_sessions=300)
    assert lake.state()["plan_limited_before"] == old.isoformat()


def test_transient_error_keeps_fetched_sessions(tmp_path):
    last, lake, cfg = _setup(tmp_path)
    sessions = previous_sessions(last, 40)
    prov = Flaky({sessions[10]: 503}, end=last, sessions=400, n_stocks=30, n_etfs=5)
    out = ingest(prov, lake, cfg, now=NOW, history_sessions=40)
    assert out["stopped"] == "provider_error"
    assert len(lake.ingested_sessions()) == 29  # newest 29 saved before the failure


def test_bad_key_is_fatal_and_leaves_no_floor(tmp_path):
    last, lake, cfg = _setup(tmp_path)
    with pytest.raises(ProviderError):
        ingest(Flaky({last: 401}, end=last, sessions=400, n_stocks=30, n_etfs=5), lake, cfg, now=NOW, history_sessions=40)
    assert "plan_limited_before" not in lake.state()


def test_sic_from_cached_parquet_with_nan():
    assert _int_or_none(float("nan")) is None
    assert _int_or_none(None) is None
    assert _int_or_none(3571.0) == 3571
    assert _int_or_none(pd.NA) is None
