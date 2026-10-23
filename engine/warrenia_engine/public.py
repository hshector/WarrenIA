"""Public extract: what the portfolio's WarrenIA demo may show, written to a local folder.

The market data providers do not allow redistributing their data (docs/ARCHITECTURE.md), so
the app itself stays behind a login. This extract keeps only what WarrenIA *computes* or what
is public by origin, and drops every price:

- Kept: scores, ranks, states, actions and their reasons, returns and risk measures (ratios),
  the rank history, SEC fundamentals (US public domain), company profiles, the market summary
  (breadth, sectors), signal changes, the backtest (strategy curves, no prices), ECB FX rates
  (reusable with the source cited) and the company logos (Logo.dev, attribution shown).
- Dropped: closing prices (`px`, `price`), price series and corporate events, moving-average
  levels (`sma20/50/100/200`) and any sentence that quotes one ("today $123.45").

`check()` fails the run if a price slipped through, so a new field in the engine cannot leak one.

Output (plain JSON, one file per asset, so a static host can serve it as is):
  latest.json (with `files`: which of signals, backtest and fx it has) · meta.json · market.json · radar.json · excluded.json · signals.json
  backtest.json · fx.json · assets/<TICKER>.json · logos/<TICKER>.png · logos/index.json · SOURCES.md
"""

from __future__ import annotations

import json
import logging
import re
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from .logos import TICKER_RE
from .storage import Storage, read_json

log = logging.getLogger(__name__)

PRICE_INDICATORS = {"price", "sma20", "sma50", "sma100", "sma200"}
# "(today 123.45; " · "(today $123.45)" · "(today 123.45 vs 120.00)"
TODAY_LEVEL = re.compile(r"\(today \$?[\d,.]+(?: vs \$?[\d,.]+)?\)")
TODAY_LEVEL_LEAD = re.compile(r"\(today \$?[\d,.]+; ")
# a level ("today 123.45", "today $9"), not a score ("today 70/100") or a change ("today +1.2%")
LEAK = re.compile(r"today \$?\d[\d,]*(?:\.\d+)?(?![\d,.]*\s*(?:/|%))")

SOURCES = """# WarrenIA, public extract

Computed every night by the WarrenIA engine from end-of-day market data. Market prices are not included: the providers do not allow redistributing them.

- Scores, ranks, states, reasons, returns and risk measures: computed by WarrenIA.
- Annual accounts: SEC EDGAR (public domain).
- Exchange rates: European Central Bank reference rates (source: ECB).
- Company logos: Logo.dev (https://logo.dev), "Logos provided by Logo.dev".

Not investment advice.
"""


def _strip_prices(text: str) -> str:
    text = TODAY_LEVEL_LEAD.sub("(", text)
    text = TODAY_LEVEL.sub("", text)
    text = re.sub(r" {2,}", " ", text)
    return re.sub(r"\s+([.,;)])", r"\1", text).replace("()", "").strip()


def _texts(v: Any) -> Any:
    if isinstance(v, str):
        return _strip_prices(v)
    if isinstance(v, list):
        return [_texts(x) for x in v]
    if isinstance(v, dict):
        return {k: _texts(x) for k, x in v.items()}
    return v


def row(r: dict) -> dict:
    return {**r, "px": None}


def asset(d: dict) -> dict:
    d = {k: v for k, v in d.items() if k not in ("series", "events")}
    d["row"] = row(d["row"])
    if d.get("indicators"):
        d["indicators"] = {k: v for k, v in d["indicators"].items() if k not in PRICE_INDICATORS}
    for k in ("action", "report", "state"):
        if d.get(k):
            d[k] = _texts(d[k])
    return d


def market(m: dict) -> dict:
    return {**m, "benchmarks": {b: {k: v for k, v in x.items() if k != "price"} for b, x in (m.get("benchmarks") or {}).items()}}


def meta(m: dict) -> dict:
    m = dict(m)
    m["reports"] = {c: [_texts(r) for r in rs] for c, rs in (m.get("reports") or {}).items()}
    return m


def _walk(v: Any, f: Path, path: str) -> None:
    if isinstance(v, dict):
        for k, x in v.items():
            if k in ("px", "price") and x is not None and f.name != "fx.json":
                raise ValueError(f"price left in {f.name}: {path}.{k}")
            if k in ("series", "events") and f.parent.name == "assets":
                raise ValueError(f"price series left in {f.name}: {path}.{k}")
            if k in PRICE_INDICATORS and path.endswith("indicators"):
                raise ValueError(f"price level left in {f.name}: {path}.{k}")
            _walk(x, f, f"{path}.{k}")
    elif isinstance(v, list):
        for i, x in enumerate(v):
            _walk(x, f, f"{path}[{i}]")
    elif isinstance(v, str) and LEAK.search(v):
        raise ValueError(f"price quoted in {f.name}: {path}: {v[:80]}")


def check(out: Path) -> None:
    """Fail if a price could have slipped through (field names and sentences)."""
    for f in out.rglob("*.json"):
        _walk(json.loads(f.read_text()), f, "")


def build(storage: Storage, out: Path, prefix: str = "published", workers: int = 8) -> dict:
    t0 = time.monotonic()
    timings: dict[str, float] = {}

    def lap(name: str) -> None:
        timings[name] = round(time.monotonic() - t0 - sum(timings.values()), 1)

    latest = read_json(storage, f"{prefix}/latest.json")
    if not latest:
        raise RuntimeError("nothing published yet")
    run = f"{prefix}/{latest['path']}"
    if out.exists():
        shutil.rmtree(out)
    (out / "assets").mkdir(parents=True)
    (out / "logos").mkdir()

    def put(name: str, obj: Any) -> None:
        (out / name).write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False, allow_nan=False))

    put("meta.json", meta(read_json(storage, f"{run}/meta.json")))
    put("market.json", market(read_json(storage, f"{run}/market.json")))
    radar = read_json(storage, f"{run}/radar.json.gz")
    put("radar.json", {**radar, "rows": [row(r) for r in radar["rows"]]})
    excluded = read_json(storage, f"{run}/excluded.json.gz") or []
    put("excluded.json", [{**e, "px": None} for e in excluded])
    optional = []
    for name, path in (("signals.json", f"{prefix}/signals.json"), ("backtest.json", f"{prefix}/backtest/latest.json"),
                       ("fx.json", f"{prefix}/fx/ecb.json")):
        obj = read_json(storage, path)
        if obj is not None:
            put(name, obj)
            optional.append(name)

    lap("summary files")

    # the shards and the logos are many small downloads: several at a time
    tickers = {r["t"] for r in radar["rows"]}
    n_assets = 0
    shards = [f for f in storage.list(f"{run}/assets") if f.endswith(".json.gz")]
    with ThreadPoolExecutor(workers) as pool:
        for shard in pool.map(lambda f: read_json(storage, f) or {}, shards):
            for tk, d in shard.items():
                # (benchmarks and sector ETFs also have a detail: only their series, which is dropped)
                if tk in tickers and TICKER_RE.match(tk) and "row" in d:
                    put(f"assets/{tk}.json", asset(d))
                    n_assets += 1
    lap("assets")

    wanted = [f for f in storage.list(f"{prefix}/logos")
              if f.endswith(".png") and (tk := f.rsplit("/", 1)[1][:-4]) in tickers and TICKER_RE.match(tk)]
    logos = []
    with ThreadPoolExecutor(workers) as pool:
        for f, data in zip(wanted, pool.map(storage.read_bytes, wanted)):
            if data:
                tk = f.rsplit("/", 1)[1][:-4]
                (out / "logos" / f"{tk}.png").write_bytes(data)
                logos.append(tk)
    put("logos/index.json", {"have": sorted(logos)})
    lap("logos")
    (out / "SOURCES.md").write_text(SOURCES)
    # (last, and with the optional files it has, so a reader never asks for one that is not there)
    put("latest.json", {**latest, "path": ".", "files": optional})

    check(out)
    lap("check")
    summary = {"run_id": latest["run_id"], "data_asof": latest["data_asof"], "demo": latest.get("demo", False),
               "rows": len(radar["rows"]), "assets": n_assets, "logos": len(logos), "seconds": timings}
    log.info("public extract: %s", summary)
    return summary
