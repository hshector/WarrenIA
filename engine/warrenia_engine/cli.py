"""Command line entry point.

  python -m warrenia_engine demo        synthetic market -> local data dir (clearly flagged DEMO)
  python -m warrenia_engine update      real providers: ingest + compute + publish
  python -m warrenia_engine compute     recompute + publish from the existing lake
  python -m warrenia_engine eu-prices   EUR prices (EODHD) + ECB FX for portfolio instruments
  python -m warrenia_engine backtest    walk-forward backtest -> published/backtest.json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone

from .calendar import last_closed_session
from .config import load_config
from .lake import Lake
from .storage import LocalStorage, storage_from_env


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="warrenia_engine")
    ap.add_argument("command", choices=["demo", "update", "compute", "eu-prices", "backtest"])
    ap.add_argument("--max-minutes", type=float, default=float(os.environ.get("INGEST_MAX_MINUTES", "300")))
    ap.add_argument("--data-dir", default=None, help="local storage dir (overrides env)")
    args = ap.parse_args(argv)

    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s", stream=sys.stdout)
    cfg = load_config()
    storage = LocalStorage(args.data_dir) if args.data_dir else storage_from_env()
    now = datetime.now(timezone.utc)

    if args.command == "demo":
        from .pipeline import compute_and_publish, ingest
        from .providers.synthetic import SyntheticProvider

        from .calendar import previous_sessions, session_close_utc
        from datetime import timedelta

        prov = SyntheticProvider(end=last_closed_session(now).session)
        summary = ingest(prov, Lake(storage), cfg, now=now, fundamentals_provider=prov)
        # Publish the previous session first so the demo shows state changes between runs.
        prev = previous_sessions(last_closed_session(now).session, 2)[0]
        compute_and_publish(storage, cfg, now=session_close_utc(prev) + timedelta(hours=5), demo=True,
                            provider_name="synthetic (DEMO)")
        out = compute_and_publish(storage, cfg, now=now, demo=True, provider_name="synthetic (DEMO)")
        print(json.dumps({"ingest": summary, "publish": out}, indent=2, ensure_ascii=False))
        return 0

    if args.command in ("update", "compute"):
        from .pipeline import compute_and_publish, ingest

        if args.command == "update":
            from .providers.massive import MassiveProvider
            from .providers.sec import SecFundamentals

            prov = MassiveProvider.from_env()
            sec = SecFundamentals.from_env()
            summary = ingest(prov, Lake(storage), cfg, now=now, max_seconds=args.max_minutes * 60,
                             fundamentals_provider=sec)
            print(json.dumps({"ingest": summary}, indent=2, ensure_ascii=False))
        out = compute_and_publish(storage, cfg, now=now, demo=False)
        print(json.dumps({"publish": out}, indent=2, ensure_ascii=False))
        return 0 if out["status"] == "ok" else 0  # degraded runs still publish (flagged)

    if args.command == "eu-prices":
        from .portfolio_prices import update_portfolio_prices

        print(json.dumps(update_portfolio_prices(storage, now=now), indent=2, ensure_ascii=False))
        return 0

    if args.command == "backtest":
        from .backtest import run_and_publish

        print(json.dumps(run_and_publish(storage, cfg, now=now), indent=2, ensure_ascii=False)[:4000])
        return 0
    return 1
