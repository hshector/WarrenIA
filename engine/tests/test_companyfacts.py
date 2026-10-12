"""Incremental download of SEC companyfacts for filers missing from the US GAAP frames."""

from datetime import datetime, timedelta, timezone

import pandas as pd

from warrenia_engine.fundamentals import FACT_COLUMNS
from warrenia_engine.lake import Lake
from warrenia_engine.pipeline import all_facts, refresh_companyfacts
from warrenia_engine.storage import LocalStorage


class FakeSec:
    def __init__(self):
        self.calls = []

    def companyfacts(self, cik):
        self.calls.append(cik)
        return [(cik, "revenue", "ifrs-full:Revenue", "dur", "2025-01-01", "2025-12-31", 100.0, "EUR")]


def test_fetches_only_uncovered_adrs_and_ranked_stocks_and_caches(tmp_path):
    lake = Lake(LocalStorage(tmp_path))
    tickers = pd.DataFrame({"ticker": ["GAAP", "ADR1", "ADR2", "SMALL"], "type": ["CS", "ADRC", "ADRC", "CS"]})
    fund = pd.DataFrame({"ticker": ["GAAP", "ADR1", "ADR2", "SMALL"], "cik": ["0000000001", "0000000002", "0000000003", "0000000004"]})
    frames = pd.DataFrame([(1, "revenue", "Revenues", "dur", "2025-01-01", "2025-12-31", 5.0, "USD")], columns=FACT_COLUMNS)
    now = datetime(2026, 10, 12, tzinfo=timezone.utc)
    sec = FakeSec()
    fetched = refresh_companyfacts(sec, lake, fund, tickers, frames, {}, now, max_calls=1)
    assert sec.calls == [2]  # GAAP is covered by frames, SMALL is not an ADR nor ranked; budget of 1 call
    fetched = refresh_companyfacts(sec, lake, fund, tickers, frames, fetched, now)
    assert sec.calls == [2, 3]  # cached ADR1 is not fetched again
    assert set(lake.read_ref("facts_cf")["cik"]) == {2, 3}
    later = now + timedelta(days=46)
    refresh_companyfacts(sec, lake, fund, tickers, frames, fetched, later)
    assert sec.calls == [2, 3, 2, 3]  # refreshed after 45 days, without duplicating rows
    assert len(lake.read_ref("facts_cf")) == 2
    lake.write_ref("facts", frames)
    assert set(all_facts(lake)["cik"]) == {1, 2, 3}
