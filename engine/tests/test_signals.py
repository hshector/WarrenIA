"""Signal-change log and Web Push notifications."""

from datetime import datetime, timezone

from warrenia_engine import signals
from warrenia_engine.storage import LocalStorage, read_json, write_json


def row(t, act, hold=True, rank=1, cls="stock"):
    return {"t": t, "n": f"{t} Inc", "cls": cls, "act": act, "hold": hold, "rank": rank, "ov": 80.0, "fund": 60.0}


PREV = {"AAA": ["watch", True, "AAA Inc"], "BBB": ["candidate", True, "BBB Inc"], "CCC": ["candidate", True, "CCC Inc"],
        "DDD": ["watch", True, "DDD Inc"], "EEE": ["none", False, "EEE Inc"]}
NOW_ROWS = [row("AAA", "candidate", rank=3), row("BBB", "candidate", hold=True, rank=1), row("CCC", "avoid", hold=False, rank=9),
            row("NEW", "candidate", rank=2), row("ETF1", "candidate", cls="etf")]


def test_diff_finds_action_and_hold_changes_and_dropouts():
    ev = signals.diff(PREV, NOW_ROWS, "2026-10-09")
    by = {e["t"]: e for e in ev}
    assert set(by) == {"AAA", "CCC", "DDD"}  # BBB unchanged, NEW newly eligible, ETF ignored, EEE was "none"
    assert by["AAA"]["from"] == "watch" and by["AAA"]["to"] == "candidate"
    assert by["CCC"]["hold_from"] is True and by["CCC"]["hold_to"] is False
    assert by["DDD"]["to"] == "out"
    assert [e["t"] for e in ev] == ["AAA", "CCC", "DDD"]  # by rank, dropouts last
    assert signals.diff({}, NOW_ROWS, "2026-10-09") == []  # first run: no baseline, no noise


def test_log_replaces_same_session_and_drops_old(tmp_path):
    st = LocalStorage(tmp_path)
    write_json(st, signals.LOG_PATH, {"events": [{"asof": "2026-01-02", "t": "OLD"}, {"asof": "2026-10-08", "t": "X"},
                                                 {"asof": "2026-10-09", "t": "STALE"}]}, gz=False)
    out = signals.append_log(st, [{"asof": "2026-10-09", "t": "Y"}], "2026-10-09")
    assert [e["t"] for e in out["events"]] == ["Y", "X"]
    assert read_json(st, signals.LOG_PATH)["asof"] == "2026-10-09"


def test_relevance_and_message():
    ev = signals.diff(PREV, NOW_ROWS, "2026-10-09")
    g = signals.relevant(ev, held={"CCC"}, watch={"DDD"}, prefs={})
    assert [e["t"] for e in g["holdings"]] == ["CCC"]
    assert [e["t"] for e in g["watchlist"]] == ["DDD"]
    assert [e["t"] for e in g["candidates"]] == ["AAA"]
    m = signals.message(g, "2026-10-09")
    assert m["title"] == "Review CCC: consider selling"
    assert "CCC (you own it): now consider selling" in m["body"]
    assert "DDD (you own it)" not in m["body"] and "DDD: no longer analysed" in m["body"]
    assert "New buy candidate: AAA" in m["body"]
    assert m["url"] == "/alerts" and m["tag"] == "signals-2026-10-09"
    off = signals.relevant(ev, held=set(), watch=set(), prefs={"candidates": False})
    assert signals.message(off, "2026-10-09") is None


def test_holdings_net_quantity_with_split_and_sale():
    ins = [{"id": "i1", "user_id": "u1", "market_ticker": "aaa"}, {"id": "i2", "user_id": "u1", "market_ticker": "BBB"}]
    txs = [{"instrument_id": "i1", "type": "buy", "quantity": 2, "split_ratio": None, "trade_date": "2026-01-02"},
           {"instrument_id": "i1", "type": "split", "quantity": None, "split_ratio": 2, "trade_date": "2026-02-02"},
           {"instrument_id": "i1", "type": "sell", "quantity": 3, "split_ratio": None, "trade_date": "2026-03-02"},
           {"instrument_id": "i2", "type": "buy", "quantity": 1, "split_ratio": None, "trade_date": "2026-01-02"},
           {"instrument_id": "i2", "type": "sell", "quantity": 1, "split_ratio": None, "trade_date": "2026-02-02"}]
    assert signals.holdings_by_user(ins, txs) == {"u1": {"AAA"}}


class FakeDb:
    def __init__(self):
        self.deleted = []
        self.tables = {
            "push_subscriptions": [{"id": "s1", "user_id": "u1", "endpoint": "https://push/1", "p256dh": "k", "auth": "a"},
                                   {"id": "s2", "user_id": "u1", "endpoint": "https://push/2", "p256dh": "k", "auth": "a"}],
            "settings": [{"user_id": "u1", "notify": {"candidates": False}}],
            "watchlist": [{"user_id": "u1", "ticker": "AAA"}],
            "instruments": [],
        }

    def select(self, table, query):
        return self.tables.get(table, [])

    def delete(self, table, query):
        self.deleted.append((table, query))


def _setup(tmp_path, monkeypatch, demo=False):
    st = LocalStorage(tmp_path)
    write_json(st, "published/latest.json", {"demo": demo}, gz=False)
    signals.append_log(st, signals.diff(PREV, NOW_ROWS, "2026-10-09"), "2026-10-09")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "x")
    monkeypatch.setenv("VAPID_SUBJECT", "me@example.com")
    return st


def test_notify_sends_once_per_session_and_drops_dead_subscriptions(tmp_path, monkeypatch):
    st = _setup(tmp_path, monkeypatch)
    sent = []

    def sender(sub, payload, key, subject):
        sent.append((sub["id"], payload, subject))
        return 410 if sub["id"] == "s2" else 201

    db = FakeDb()
    now = datetime(2026, 10, 10, 6, tzinfo=timezone.utc)
    out = signals.notify(st, now=now, db=db, sender=sender)
    assert out["sent"] == 1 and out["removed"] == 1 and db.deleted == [("push_subscriptions", "id=eq.s2")]
    assert sent[0][1]["body"] == "AAA: Watch → Buy candidate" and sent[0][2] == "mailto:me@example.com"
    again = signals.notify(st, now=now, db=db, sender=sender)
    assert again["skipped"] == "already sent"


def test_notify_skips_demo_and_missing_keys(tmp_path, monkeypatch):
    st = _setup(tmp_path, monkeypatch, demo=True)
    assert signals.notify(st, db=FakeDb(), sender=lambda *a: 201)["skipped"] == "demo data"
    st2 = _setup(tmp_path / "b", monkeypatch)
    monkeypatch.delenv("VAPID_PRIVATE_KEY")
    assert "VAPID" in signals.notify(st2, db=FakeDb(), sender=lambda *a: 201)["skipped"]


def test_browser_generated_raw_key_is_accepted_by_pywebpush():
    """The web app generates raw base64url P-256 keys (like `web-push generate-vapid-keys`)."""
    import base64

    from cryptography.hazmat.primitives.asymmetric import ec
    from py_vapid import Vapid

    k = ec.generate_private_key(ec.SECP256R1())
    raw = k.private_numbers().private_value.to_bytes(32, "big")
    b64 = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    v = Vapid.from_string(b64)
    headers = v.sign({"sub": "mailto:me@example.com", "aud": "https://fcm.googleapis.com", "exp": 2_000_000_000})
    assert "vapid t=" in headers["Authorization"]
