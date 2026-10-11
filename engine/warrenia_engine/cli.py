"""Command line entry point.

  python -m warrenia_engine doctor      check secrets, Supabase permissions and providers (seconds)
  python -m warrenia_engine demo        synthetic market -> local data dir (clearly flagged DEMO)
  python -m warrenia_engine update      real providers: ingest + compute + publish
  python -m warrenia_engine compute     recompute + publish from the existing lake
  python -m warrenia_engine eu-prices   EUR prices (EODHD) + ECB FX for portfolio instruments
  python -m warrenia_engine logos       company logos (Logo.dev) cached in storage, once per ticker
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
    ap.add_argument("command", choices=["doctor", "demo", "update", "compute", "eu-prices", "logos", "backtest"])
    ap.add_argument("--max-minutes", type=float, default=float(os.environ.get("INGEST_MAX_MINUTES", "300")))
    ap.add_argument("--data-dir", default=None, help="local storage dir (overrides env)")
    args = ap.parse_args(argv)

    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s", stream=sys.stdout)
    if args.command == "doctor":
        from .doctor import report, run_doctor

        ok, checks = run_doctor()
        md = report(checks)
        print(md)
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
                f.write("## Comprobación de configuración\n\n" + md + "\n")
        for c in checks:
            if not c.ok and c.fatal:
                print(f"::error title={c.name}::{c.detail}")
        return 0 if ok else 1

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
        from .pipeline import refresh_profiles
        if refresh_profiles(prov, Lake(storage), storage, now=now, max_calls=200).get("fetched"):
            out = compute_and_publish(storage, cfg, now=now, demo=True, provider_name="synthetic (DEMO)")
        print(json.dumps({"ingest": summary, "publish": out}, indent=2, ensure_ascii=False))
        return 0

    if args.command in ("update", "compute"):
        from .pipeline import compute_and_publish, ingest
        from .storage import read_json

        # Scheduled retry after a successful run: nothing to do (saves provider quota and storage egress).
        if args.command == "update" and os.environ.get("GITHUB_EVENT_NAME") == "schedule":
            pub = read_json(storage, "published/latest.json")
            if pub and not pub.get("demo") and pub.get("status") == "ok" \
                    and pub.get("data_asof") == last_closed_session(now).session.isoformat():
                print(json.dumps({"skipped": "ya publicado", "data_asof": pub["data_asof"]}))
                return 0

        if args.command == "update":
            from .providers.massive import MassiveProvider
            from .providers.sec import SecFundamentals

            prov = MassiveProvider.from_env()
            sec = SecFundamentals.from_env()
            summary = ingest(prov, Lake(storage), cfg, now=now, max_seconds=args.max_minutes * 60,
                             fundamentals_provider=sec)
            print(json.dumps({"ingest": summary}, indent=2, ensure_ascii=False))
            from .pipeline import refresh_profiles
            try:  # profiles of the previous ranking's leaders; informative, never blocks the publish
                print(json.dumps({"profiles": refresh_profiles(prov, Lake(storage), storage, now=now)}))
            except Exception as e:  # noqa: BLE001
                print(json.dumps({"profiles": f"failed: {type(e).__name__}"}))
        out = compute_and_publish(storage, cfg, now=now, demo=False)
        print(json.dumps({"publish": out}, indent=2, ensure_ascii=False))
        return 0 if out["status"] == "ok" else 0  # degraded runs still publish (flagged)

    if args.command == "eu-prices":
        from .portfolio_prices import update_portfolio_prices

        print(json.dumps(update_portfolio_prices(storage, now=now), indent=2, ensure_ascii=False))
        return 0

    if args.command == "logos":
        from .logos import run_from_env

        out = run_from_env(storage)
        print(json.dumps(out, indent=2, ensure_ascii=False))
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
                f.write("## Logos (Logo.dev)\n\n```json\n" + json.dumps(out, indent=2, ensure_ascii=False) + "\n```\n")
        return 0

    if args.command == "backtest":
        from .backtest import run_and_publish

        print(json.dumps(run_and_publish(storage, cfg, now=now), indent=2, ensure_ascii=False)[:4000])
        return 0
    return 1
