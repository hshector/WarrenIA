"""End-to-end pipeline: incremental ingest -> compute -> publish."""

from __future__ import annotations

import logging
import os
import time
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd

from .calendar import last_closed_session, previous_sessions, session_close_utc, sessions_between, get_calendar
from .compute import build_context, evaluate, rank_history
from .config import Config
from .http import ProviderError
from .lake import Lake
from .panels import build_panels
from .providers.base import DIVIDEND_COLUMNS, SPLIT_COLUMNS, empty
from .publish import build_artifacts, new_run_id, previous_meta, previous_states, publish
from .storage import Storage, write_parquet
from .universe import classify_assets

log = logging.getLogger(__name__)

HISTORY_SESSIONS = 540  # ~2y + buffer (free plans typically allow 2 years)


def ingest(provider, lake: Lake, cfg: Config, now: datetime | None = None, max_seconds: float | None = None,
           history_sessions: int = HISTORY_SESSIONS, fundamentals_provider=None) -> dict:
    t0 = time.monotonic()
    now = now or datetime.now(timezone.utc)
    last = last_closed_session(now).session
    wanted = previous_sessions(last, history_sessions)
    earliest = provider.earliest_available(last)
    if earliest:
        wanted = [d for d in wanted if d >= earliest]
    state = lake.state()
    plan_floor = state.get("plan_limited_before")
    if plan_floor:
        wanted = [d for d in wanted if d > date.fromisoformat(plan_floor)]
    have = lake.ingested_sessions()
    missing = sorted(set(wanted) - have, reverse=True)  # newest first: today's data is usable ASAP
    log.info("ingest: %d sessions wanted, %d missing (last closed %s)", len(wanted), len(missing), last)

    fetched: list[date] = []
    empty_sessions: list[date] = []
    buffer: list[pd.DataFrame] = []
    stopped = None

    def flush() -> None:
        nonlocal buffer
        if buffer:
            lake.upsert_bars(pd.concat(buffer, ignore_index=True))
            st = lake.state()
            st["sessions"] = sorted({*st.get("sessions", []), *(d.isoformat() for d in fetched)})
            st["provider"] = provider.name
            lake.save_state(st)
            buffer = []

    refused: list[date] = []
    try:
        for d in missing:
            if max_seconds and time.monotonic() - t0 > max_seconds:
                stopped = "time_budget"
                break
            try:
                df = provider.grouped_daily(d)
            except ProviderError as e:
                if e.status == 401:
                    raise ProviderError(f"{provider.name}: la API key no es válida (401)", 401) from e
                if e.status in (402, 403):
                    if (last - d).days > 365:
                        # Older than the plan window: never retry below this floor.
                        log.warning("ingest: provider refused %s (%s); history floor set", d, e.status)
                        st = lake.state()
                        st["plan_limited_before"] = d.isoformat()
                        lake.save_state(st)
                        stopped = "plan_limit"
                        break
                    # Recent date refused (e.g. not yet available on the plan): retry on the next run.
                    log.warning("ingest: provider refused %s (%s); will retry", d, e.status)
                    refused.append(d)
                    continue
                # Transient (rate limit / 5xx / network after retries): keep what we have and publish it.
                log.warning("ingest: stopping early: %s", e)
                stopped = "provider_error"
                break
            if df is None or df.empty:
                empty_sessions.append(d)  # will be retried on the next run
                continue
            buffer.append(df)
            fetched.append(d)
            if len(buffer) >= 20:
                flush()
    finally:
        flush()
    empty_sessions.extend(refused)

    st = lake.state()
    refreshed = st.setdefault("refreshed", {})
    warnings: list[str] = []
    if empty_sessions:
        warnings.append(f"Sin datos del proveedor para {len(empty_sessions)} sesión(es): "
                        + ", ".join(d.isoformat() for d in sorted(empty_sessions)[-5:]))

    # Reference tickers: weekly.
    if _older_than(refreshed.get("tickers"), days=7, now=now) or lake.read_ref("tickers") is None:
        try:
            tk = provider.tickers()
            lake.write_ref("tickers", tk)
            refreshed["tickers"] = now.isoformat(timespec="seconds")
            log.info("ingest: %d reference tickers", len(tk))
        except ProviderError as e:
            warnings.append(f"Lista de valores no actualizada ({e.status}); se usa la anterior.")
            log.warning("ingest: tickers refresh failed: %s", e)

    # Corporate actions: incremental with a 10-day overlap.
    first = min(wanted) if wanted else last
    for name, fn, cols, keys in (("splits", provider.splits, SPLIT_COLUMNS, ["ticker", "ex_date"]),
                                 ("dividends", provider.dividends, DIVIDEND_COLUMNS, ["ticker", "ex_date"])):
        since = st.get(f"{name}_through")
        start = (date.fromisoformat(since) - timedelta(days=10)) if since else first
        try:
            ev = fn(start, last + timedelta(days=7))
            lake.upsert_events(name, ev if not ev.empty else empty(cols), keys)
            st[f"{name}_through"] = last.isoformat()
            st[f"{name}_available"] = True
        except ProviderError as e:
            st[f"{name}_available"] = False
            warnings.append(f"{name}: no disponible en el proveedor ({e.status}). "
                            + ("Rentabilidades sin dividendos." if name == "dividends" else "Splits sin ajustar."))
            log.warning("ingest: %s unavailable: %s", name, e)

    if fundamentals_provider is not None and (_older_than(refreshed.get("fundamentals"), days=7, now=now)
                                              or lake.read_ref("fundamentals") is None):
        try:
            tickers = lake.read_ref("tickers")
            f = fundamentals_provider.fundamentals(tickers, previous=lake.read_ref("fundamentals"))
            lake.write_ref("fundamentals", f)
            refreshed["fundamentals"] = now.isoformat(timespec="seconds")
            log.info("ingest: fundamentals for %d tickers", len(f))
        except Exception as e:  # never let fundamentals stop the daily publish
            log.exception("ingest: fundamentals failed")
            warnings.append(f"Fundamentales (SEC) no disponibles: {type(e).__name__}")
    st["refreshed"] = refreshed
    st["last_ingest_warnings"] = warnings
    lake.save_state(st)
    return {"fetched": len(fetched), "missing_before": len(missing), "empty": [d.isoformat() for d in empty_sessions],
            "stopped": stopped, "warnings": warnings, "last_closed": last.isoformat(),
            "seconds": round(time.monotonic() - t0, 1)}


def _older_than(ts: str | None, days: int, now: datetime) -> bool:
    if not ts:
        return True
    return datetime.fromisoformat(ts) < now - timedelta(days=days)


def prefilter(bars: pd.DataFrame, tickers: pd.DataFrame, cfg: Config) -> set[str]:
    """Performance-only candidate filter (generous, so point-in-time rules decide)."""
    cls = classify_assets(tickers.drop_duplicates("ticker", keep="last"), cfg.universe)
    keep_types = set(cls[cls.notna()].index)
    b = bars[bars["ticker"].isin(keep_types)]
    dv = (b["close"] * b["volume"]).groupby(b["ticker"]).quantile(0.9)
    px = b.groupby("ticker")["close"].max()
    min_adv = min(cfg.universe["stocks"]["min_adv_usd"], cfg.universe["etfs"]["min_adv_usd"]) * 0.25
    min_px = min(cfg.universe["stocks"]["min_price"], cfg.universe["etfs"]["min_price"]) * 0.5
    ok = set(dv[dv >= min_adv].index) & set(px[px >= min_px].index)
    return ok | set(cfg.reference_tickers)


def compute_and_publish(storage: Storage, cfg: Config, now: datetime | None = None, demo: bool = False,
                        provider_name: str | None = None) -> dict:
    t0 = time.monotonic()
    now = now or datetime.now(timezone.utc)
    lake = Lake(storage)
    st = lake.state()
    sessions = sorted(date.fromisoformat(d) for d in st.get("sessions", []))
    if not sessions:
        raise RuntimeError("lake is empty: run ingest first")
    last_closed = last_closed_session(now).session
    asof = max(d for d in sessions if d <= last_closed)
    start = previous_sessions(asof, HISTORY_SESSIONS)[0]
    tickers = lake.read_ref("tickers")
    if tickers is None:
        raise RuntimeError("reference tickers missing")
    bars = lake.load_bars(start=start)
    keep = prefilter(bars, tickers, cfg)
    bars = bars[bars["ticker"].isin(keep)]
    cal = [d for d in sessions_between(max(start, sessions[0]), asof)]
    splits, divs = lake.read_ref("splits"), lake.read_ref("dividends")
    P = build_panels(bars, splits, divs, sessions=cal)
    missing_refs = [b for b in cfg.reference_tickers if not P.has(b)]
    if cfg.primary_benchmark in missing_refs:
        raise RuntimeError(f"primary benchmark {cfg.primary_benchmark} has no data")
    ctx = build_context(cfg, P, tickers, lake.read_ref("fundamentals"))
    t = P.t_index(asof)
    log.info("compute: asof=%s sessions=%d tickers=%d (stocks %d, etfs %d)", asof, len(P.dates), len(P.tickers),
             len(ctx.cols["stock"]), len(ctx.cols["etf"]))

    res = evaluate(ctx, t)
    hist = rank_history(ctx, t)

    warnings = list(st.get("last_ingest_warnings", []))
    status = "ok"
    min_needed = cfg.universe["stocks"]["min_history_sessions"] + cfg.windows["accel_lookback"]
    if len(P.dates) < min_needed:
        status = "degraded"
        warnings.append(f"Historial incompleto ({len(P.dates)} sesiones; se necesitan {min_needed}). "
                        "La descarga inicial sigue en curso.")
    expected = last_closed
    if asof < expected:
        status = "degraded"
        warnings.append(f"Los datos más recientes son del {asof}; la última sesión cerrada es {expected}.")
    prev = previous_meta(storage)
    n_elig = len(res["stock"].scores)
    if prev and prev.get("coverage", {}).get("stock", {}).get("eligible"):
        prev_n = prev["coverage"]["stock"]["eligible"]
        if n_elig < cfg.universe["data_quality"]["min_universe_coverage"] * prev_n:
            status = "degraded"
            warnings.append(f"Cobertura anómala: {n_elig} acciones elegibles frente a {prev_n} en la ejecución anterior.")
    if missing_refs:
        warnings.append("Benchmarks/ETFs sectoriales sin datos: " + ", ".join(missing_refs))
    warnings.extend(P.adjustment_notes[:20])

    run_id = new_run_id(asof, now)
    meta_extra = {
        "run_id": run_id, "computed_at": now.isoformat(timespec="seconds"),
        "session_close_utc": session_close_utc(asof).isoformat(), "expected_last_session": expected.isoformat(),
        "demo": demo, "provider": provider_name or st.get("provider", "unknown"),
        "total_return": bool(st.get("dividends_available", False)),
        "status": status, "warnings": warnings, "git_sha": os.environ.get("GITHUB_SHA"),
        "data_window": {"first_session": P.dates[0].date().isoformat(), "last_session": asof.isoformat(),
                        "sessions": int(len(P.dates)), "plan_limited_before": st.get("plan_limited_before")},
        "lake": {"refreshed": st.get("refreshed", {}), "ingested_sessions": len(sessions)},
        "data_type": "EOD (cierre diario). Sin datos intradía.",
    }
    prev_st, prev_asof = previous_states(storage)
    if prev_asof == asof.isoformat():
        # Recompute of the same session: compare with the state before that session instead.
        prev_st = {k: v for k, v in (previous_meta(storage) or {}).get("prev_states", {}).items()} or prev_st
    meta_extra["prev_states_asof"] = prev_asof
    meta_extra["calendar"] = upcoming_calendar(asof)
    art = build_artifacts(ctx, t, res, hist, meta_extra, prev_states=prev_st)
    art["meta"]["prev_states"] = prev_st
    art["meta"]["compute_seconds"] = round(time.monotonic() - t0, 1)
    publish(storage, art, run_id)
    snap = pd.DataFrame([{"ticker": r["t"], "cls": r["cls"], "rank": r["rank"], "overall": r["ov"], "momentum": r["m"],
                          "trend_quality": r["tq"], "acceleration": r["a"], "risk": r["rk"], "state": r["st"]}
                         for r in art["radar"]["rows"]])
    write_parquet(storage, f"lake/snapshots/{asof.isoformat()}.parquet", snap)
    log.info("published run %s (%s) in %.1fs: %d stocks, %d etfs eligible", run_id, status,
             time.monotonic() - t0, len(res["stock"].scores), len(res["etf"].scores))
    return {"run_id": run_id, "asof": asof.isoformat(), "status": status, "warnings": warnings,
            "eligible": {c: len(res[c].scores) for c in res}}


def upcoming_calendar(asof: date, days: int = 400) -> dict:
    """NYSE sessions (with UTC close) around asof, so the web can judge freshness
    at view time without its own holiday table."""
    cal = get_calendar("XNYS")
    start = pd.Timestamp(asof) - pd.Timedelta(days=10)
    end = min(pd.Timestamp(asof) + pd.Timedelta(days=days), cal.last_session)
    sess = cal.sessions_in_range(start, end)
    closes = cal.closes[sess]
    return {"exchange": "XNYS", "sessions": [[d.date().isoformat(), c.tz_convert("UTC").isoformat() if c.tzinfo else c.tz_localize("UTC").isoformat()]
                                             for d, c in zip(sess, closes)]}
