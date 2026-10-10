"""Exchange calendars and data freshness.

The UI must show the date of the data, not the time the page was opened. Freshness
is judged against the last *closed* session of the exchange calendar.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import exchange_calendars as xcals
import pandas as pd

# Provider EOD data is usually complete ~1-3h after the close.
DEFAULT_SETTLE = timedelta(hours=2)


@dataclass(frozen=True)
class SessionInfo:
    session: date
    close_utc: datetime


def get_calendar(code: str = "XNYS"):
    return xcals.get_calendar(code)


def sessions_between(start: date, end: date, code: str = "XNYS") -> list[date]:
    cal = get_calendar(code)
    start = max(pd.Timestamp(start), cal.first_session)
    end = min(pd.Timestamp(end), cal.last_session)
    if start > end:
        return []
    return [d.date() for d in cal.sessions_in_range(start, end)]


def session_close_utc(session: date, code: str = "XNYS") -> datetime:
    cal = get_calendar(code)
    ts = cal.session_close(pd.Timestamp(session))
    return ts.to_pydatetime().astimezone(timezone.utc)


def last_closed_session(now: datetime | None = None, code: str = "XNYS", settle: timedelta = DEFAULT_SETTLE) -> SessionInfo:
    """Most recent session whose close (+ settle time for EOD data) is before `now`."""
    now = now or datetime.now(timezone.utc)
    cal = get_calendar(code)
    day = pd.Timestamp(now.date())
    for _ in range(15):
        if cal.is_session(day):
            close = cal.session_close(day).to_pydatetime().astimezone(timezone.utc)
            if close + settle <= now:
                return SessionInfo(day.date(), close)
        day -= pd.Timedelta(days=1)
    raise RuntimeError("no closed session found in the last 15 days")


def is_stale(data_asof: date, now: datetime | None = None, code: str = "XNYS") -> bool:
    return data_asof < last_closed_session(now, code).session


def previous_sessions(session: date, n: int, code: str = "XNYS") -> list[date]:
    cal = get_calendar(code)
    end = pd.Timestamp(session)
    start = end - pd.Timedelta(days=int(n * 1.6) + 10)
    sess = [d.date() for d in cal.sessions_in_range(start, end)]
    return sess[-n:]
