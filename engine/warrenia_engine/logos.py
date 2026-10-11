"""Company logos for the radar universe, fetched once from Logo.dev and cached in storage.

- Source: Logo.dev image CDN by ticker (free Community plan, attribution shown in
  the web's Ajustes). Needs the *publishable* token in LOGO_DEV_TOKEN.
- Each ticker is fetched once. Tickers without a logo (most ETFs) are remembered and
  only retried after RETRY_MISSING_DAYS. A per-run budget keeps the job short.
- The browser never calls Logo.dev: the web serves the cached files.

Output:
  published/logos/<TICKER>.png      128 px PNG
  published/logos/index.json        {"have": [...], "missing": {ticker: "YYYY-MM-DD"}, "updated_at": ...}
"""

from __future__ import annotations

import logging
import os
import re
from datetime import date, datetime, timedelta, timezone

from .http import HttpClient, ProviderError, RateLimited
from .storage import Storage, read_json, write_json

log = logging.getLogger(__name__)

LOGO_URL = "https://img.logo.dev/ticker/{ticker}"
INDEX = "published/logos/index.json"
RETRY_MISSING_DAYS = 30
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
TICKER_RE = re.compile(r"^[A-Z0-9.\-]{1,12}$")


def universe_tickers(storage: Storage, prefix: str = "published") -> list[str]:
    """Tickers of the latest published radar (stocks first: ETFs rarely have a logo)."""
    latest = read_json(storage, f"{prefix}/latest.json")
    if not latest:
        return []
    radar = read_json(storage, f"{prefix}/{latest['path']}/radar.json.gz") or {"rows": []}
    rows = sorted(radar["rows"], key=lambda r: (r.get("cls") != "stock", r.get("rank") or 0))
    return [r["t"] for r in rows if TICKER_RE.match(r.get("t", ""))]


def update_logos(storage: Storage, token: str, now: datetime | None = None, budget: int = 800,
                 http: HttpClient | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    today = now.date()
    http = http or HttpClient("logo.dev", min_interval=0.2, max_retries=2)
    idx = read_json(storage, INDEX) or {}
    have: set[str] = set(idx.get("have", []))
    missing: dict[str, str] = dict(idx.get("missing", {}))

    def due(t: str) -> bool:
        if t in have:
            return False
        checked = missing.get(t)
        return not checked or date.fromisoformat(checked) <= today - timedelta(days=RETRY_MISSING_DAYS)

    todo = [t for t in universe_tickers(storage) if due(t)]
    fetched = absent = 0
    stopped = None
    for t in todo[:budget]:
        try:
            r = http.request("GET", LOGO_URL.format(ticker=t), allow_status={404},
                             params={"token": token, "size": 128, "format": "png", "fallback": "404"})
        except RateLimited:
            stopped = "rate-limited"
            break
        except ProviderError as e:
            if e.status in (401, 403):
                raise  # wrong or revoked token: fail loudly, nothing else will work
            log.warning("logo %s: %s", t, e)
            continue
        if r.status_code == 404 or not r.content.startswith(PNG_MAGIC):
            missing[t] = today.isoformat()
            absent += 1
            continue
        storage.write_bytes(f"published/logos/{t}.png", r.content, "image/png")
        have.add(t)
        missing.pop(t, None)
        fetched += 1

    write_json(storage, INDEX, {"source": "Logo.dev", "have": sorted(have), "missing": dict(sorted(missing.items())),
                                "updated_at": now.isoformat(timespec="seconds")})
    out = {"fetched": fetched, "without_logo": absent, "pending": max(0, len(todo) - fetched - absent),
           "total_with_logo": len(have), "stopped": stopped}
    log.info("logos: %s", out)
    return out


def run_from_env(storage: Storage) -> dict:
    token = os.environ.get("LOGO_DEV_TOKEN", "").strip()
    if not token:
        return {"skipped": "LOGO_DEV_TOKEN no configurado"}
    if token.startswith("sk_"):
        # The secret key must never be sent as an image-URL token.
        raise SystemExit("LOGO_DEV_TOKEN es la clave secreta (sk_…): usa la publicable (pk_…)")
    return update_logos(storage, token)
