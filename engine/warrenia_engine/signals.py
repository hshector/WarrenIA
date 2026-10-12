"""Signal changes between runs, and who should hear about them.

Every compute compares each stock's action ("Buy candidate", "Wait for a dip", ...) and
hold verdict (keep / consider selling) with the previous published run and appends the
differences to published/signals.json (a rolling log the web shows under Alerts).

`notify` (python -m warrenia_engine notify) then sends one Web Push message per user
with the changes that concern them: stocks they own, stocks they follow and, if they
want, new buy candidates. It runs after the publish in the daily job and never sends
the same session twice.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any

from .http import HttpClient, ProviderError
from .storage import Storage, read_json, supabase_base_url, supabase_headers, write_json

log = logging.getLogger(__name__)

LOG_PATH = "published/signals.json"
STATE_PATH = "lake/notify_state.json"
KEEP_DAYS = 120

ACTION_LABEL = {"candidate": "Buy candidate", "wait": "Wait for a dip", "watch": "Watch", "avoid": "Avoid",
                "none": "No signal", "out": "Not scored"}
DEFAULT_PREFS = {"holdings": True, "watchlist": True, "candidates": True}


# ------------------------------------------------------------------ events

def snapshot(rows: list[dict]) -> dict[str, list]:
    """Compact per-stock state kept in meta: ticker -> [action, hold, name]."""
    return {r["t"]: [r.get("act"), bool(r.get("hold")), r.get("n")] for r in rows if r.get("cls") == "stock"}


def diff(prev: dict[str, list], rows: list[dict], asof: str) -> list[dict]:
    """Action or hold changes since `prev` (stocks only: US ETFs cannot be bought from the EU)."""
    if not prev:
        return []
    now = {r["t"]: r for r in rows if r.get("cls") == "stock"}
    out = []
    for t, r in now.items():
        p = prev.get(t)
        if p is None:
            continue  # newly eligible: not a change of signal
        if p[0] != r.get("act") or bool(p[1]) != bool(r.get("hold")):
            out.append({"asof": asof, "t": t, "n": r.get("n"), "from": p[0], "to": r.get("act"),
                        "hold_from": bool(p[1]), "hold_to": bool(r.get("hold")), "rank": r.get("rank"),
                        "ov": r.get("ov"), "fund": r.get("fund")})
    for t, p in prev.items():
        if t not in now and p[0] not in (None, "none"):
            # Left the analysed market (filters, data gap): matters if you own it.
            out.append({"asof": asof, "t": t, "n": p[2], "from": p[0], "to": "out", "hold_from": bool(p[1]),
                        "hold_to": False, "rank": None, "ov": None, "fund": None})
    out.sort(key=lambda e: (e["rank"] is None, e["rank"] or 0))
    return out


def append_log(storage: Storage, events: list[dict], asof: str, keep_days: int = KEEP_DAYS) -> dict:
    """Replace this session's events (a recompute must not duplicate them) and drop old ones."""
    log_ = read_json(storage, LOG_PATH) or {"events": []}
    cutoff = (date.fromisoformat(asof) - timedelta(days=keep_days)).isoformat()
    kept = [e for e in log_.get("events", []) if e.get("asof") != asof and e.get("asof", "") >= cutoff]
    data = {"updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "asof": asof,
            "events": sorted(kept + events, key=lambda e: e["asof"], reverse=True)}
    write_json(storage, LOG_PATH, data, gz=False)
    return data


# ------------------------------------------------------------- per user

def relevant(events: list[dict], held: set[str], watch: set[str], prefs: dict) -> dict[str, list[dict]]:
    """The events one user cares about, by group. A stock appears in one group only."""
    p = {**DEFAULT_PREFS, **(prefs or {})}
    g: dict[str, list[dict]] = {"holdings": [], "watchlist": [], "candidates": []}
    for e in events:
        if e["t"] in held:
            if p["holdings"]:
                g["holdings"].append(e)
        elif e["t"] in watch:
            if p["watchlist"] and e["from"] != e["to"]:
                g["watchlist"].append(e)
        elif p["candidates"] and e["to"] == "candidate" and e["from"] != "candidate":
            g["candidates"].append(e)
    return g


def _line(e: dict, own: bool) -> str:
    name = e["t"]
    if e["to"] == "out":
        return f"{name}{' (you own it)' if own else ''}: no longer analysed (left the market filters)"
    if own and e["hold_from"] != e["hold_to"]:
        verdict = "keep" if e["hold_to"] else "consider selling"
        return f"{name} (you own it): now {verdict}"
    return f"{name}: {ACTION_LABEL.get(e['from'], e['from'])} → {ACTION_LABEL.get(e['to'], e['to'])}"


def message(groups: dict[str, list[dict]], asof: str, max_len: int = 1500) -> dict | None:
    """One notification for one user, or None when nothing concerns them."""
    lines = [_line(e, True) for e in groups["holdings"]] + [_line(e, False) for e in groups["watchlist"]]
    c = groups["candidates"]
    if c:
        names = ", ".join(e["t"] for e in c[:5]) + (f" and {len(c) - 5} more" if len(c) > 5 else "")
        lines.append(f"New buy candidate{'s' if len(c) > 1 else ''}: {names}")
    if not lines:
        return None
    sells = [e for e in groups["holdings"] if e["hold_from"] and not e["hold_to"] and e["to"] != "out"]
    n = len(groups["holdings"]) + len(groups["watchlist"]) + (1 if c else 0)
    title = (f"Review {sells[0]['t']}: consider selling" if len(sells) == 1 else
             f"{len(sells)} of your stocks: consider selling" if sells else
             f"{n} signal change{'s' if n > 1 else ''}")
    body = "\n".join(lines)
    if len(body) > max_len:
        body = body[: max_len - 1].rsplit("\n", 1)[0] + "\n…"
    return {"title": title, "body": body, "url": "/alerts", "tag": f"signals-{asof}"}


# ---------------------------------------------------------- Supabase I/O

class Db:
    """Minimal PostgREST client with the service-role key (bypasses RLS: server side only)."""

    def __init__(self, url: str, key: str, http: HttpClient | None = None):
        self.base = f"{supabase_base_url(url)}/rest/v1"
        self.headers = supabase_headers(key)
        self.http = http or HttpClient("supabase-rest")

    def select(self, table: str, query: str, page: int = 1000) -> list[dict]:
        out: list[dict] = []
        offset = 0
        while True:
            rows = self.http.get_json(f"{self.base}/{table}?{query}&limit={page}&offset={offset}", headers=self.headers)
            out.extend(rows)
            if len(rows) < page:
                return out
            offset += page

    def delete(self, table: str, query: str) -> None:
        self.http.request("DELETE", f"{self.base}/{table}?{query}", headers=self.headers)


def holdings_by_user(instruments: list[dict], txs: list[dict]) -> dict[str, set[str]]:
    """user_id -> market tickers with a positive net quantity."""
    qty: dict[str, float] = {}
    for t in sorted(txs, key=lambda x: x["trade_date"]):
        i = t["instrument_id"]
        q = qty.get(i, 0.0)
        if t["type"] == "buy":
            qty[i] = q + float(t["quantity"] or 0)
        elif t["type"] == "sell":
            qty[i] = q - float(t["quantity"] or 0)
        elif t["type"] == "split":
            qty[i] = q * float(t["split_ratio"] or 1)
    out: dict[str, set[str]] = {}
    for ins in instruments:
        if ins.get("market_ticker") and qty.get(ins["id"], 0.0) > 1e-9:
            out.setdefault(ins["user_id"], set()).add(ins["market_ticker"].upper())
    return out


def send_push(sub: dict, payload: dict, private_key: str, subject: str) -> int:
    """Send one Web Push message; returns the push service's HTTP status (201 = queued)."""
    from pywebpush import WebPushException, webpush

    try:
        r = webpush({"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                    json.dumps(payload), vapid_private_key=private_key, vapid_claims={"sub": subject}, ttl=24 * 3600,
                    timeout=15)
        return int(getattr(r, "status_code", 201))
    except WebPushException as e:
        return int(getattr(e.response, "status_code", 0) or 0)


def notify(storage: Storage, now: datetime | None = None, db: Db | None = None, sender=send_push,
           force: bool = False) -> dict:
    now = now or datetime.now(timezone.utc)
    log_ = read_json(storage, LOG_PATH)
    if not log_ or not log_.get("asof"):
        return {"skipped": "no signal log yet"}
    asof = log_["asof"]
    latest = read_json(storage, "published/latest.json") or {}
    if latest.get("demo"):
        return {"skipped": "demo data"}
    state = read_json(storage, STATE_PATH) or {}
    if state.get("last_asof") == asof and not force:
        return {"skipped": "already sent", "asof": asof}
    key = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    subject = os.environ.get("VAPID_SUBJECT", "").strip()
    if not key or not subject:
        return {"skipped": "VAPID_PRIVATE_KEY / VAPID_SUBJECT not set"}
    if not subject.startswith(("mailto:", "https://")):
        subject = f"mailto:{subject}"
    if db is None:
        url = os.environ.get("SUPABASE_URL")
        sk = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
        if not (url and sk):
            return {"skipped": "Supabase not configured"}
        db = Db(url, sk)
    events = [e for e in log_.get("events", []) if e.get("asof") == asof]
    try:
        subs = db.select("push_subscriptions", "select=id,user_id,endpoint,p256dh,auth")
    except ProviderError as e:
        return {"error": f"push_subscriptions: {e} (run supabase/migrations/0003_cash_notifications.sql)"}
    if not subs:
        _save_state(storage, asof, now)
        return {"asof": asof, "events": len(events), "subscriptions": 0}
    users = sorted({s["user_id"] for s in subs})
    inlist = "in.(" + ",".join(users) + ")"
    prefs = {r["user_id"]: r.get("notify") or {} for r in db.select("settings", f"select=user_id,notify&user_id={inlist}")}
    watch: dict[str, set[str]] = {}
    for r in db.select("watchlist", f"select=user_id,ticker&user_id={inlist}"):
        watch.setdefault(r["user_id"], set()).add(r["ticker"].upper())
    ins = db.select("instruments", f"select=id,user_id,market_ticker&user_id={inlist}&market_ticker=not.is.null")
    txs = db.select("transactions", "select=instrument_id,type,quantity,split_ratio,trade_date"
                    f"&user_id={inlist}&type=in.(buy,sell,split)&instrument_id=not.is.null") if ins else []
    held = holdings_by_user(ins, txs)
    sent = failed = gone = 0
    for u in users:
        msg = message(relevant(events, held.get(u, set()), watch.get(u, set()), prefs.get(u, {})), asof)
        if not msg:
            continue
        for s in (x for x in subs if x["user_id"] == u):
            status = sender(s, msg, key, subject)
            if status in (404, 410):  # the browser unsubscribed or the app was removed
                db.delete("push_subscriptions", f"id=eq.{s['id']}")
                gone += 1
            elif 200 <= status < 300:
                sent += 1
            else:
                failed += 1
                log.warning("notify: push failed with status %s", status)
    _save_state(storage, asof, now)
    return {"asof": asof, "events": len(events), "subscriptions": len(subs), "sent": sent, "failed": failed,
            "removed": gone}


def _save_state(storage: Storage, asof: str, now: datetime) -> None:
    write_json(storage, STATE_PATH, {"last_asof": asof, "sent_at": now.isoformat(timespec="seconds")}, gz=False)


def run_from_env(storage: Storage) -> dict[str, Any]:
    try:
        return notify(storage, force=os.environ.get("NOTIFY_FORCE") == "1")
    except ProviderError as e:  # never fail the daily job because of notifications
        log.exception("notify failed")
        return {"error": str(e)}
