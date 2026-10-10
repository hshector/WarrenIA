"""EUR prices for portfolio instruments (UCITS ETFs, ETCs on Xetra) + ECB FX rates.

- FX: ECB euro reference rates (official, free, daily ~16:00 CET).
- Prices: EODHD free plan (verify at eodhd.com: ~20 API calls/day, ~1 year of EOD
  history). Each instrument costs 1 call/day, so the free plan covers a handful of
  instruments. History accumulates in storage beyond the plan window.
- Instruments are read from the `instruments` table (Supabase) with the
  service-role key; only `eodhd_symbol` / `currency` are used.

Output:
  published/fx/ecb.json                     {"base":"EUR","asof":..., "rates":{"USD":[[date, rate],...]}}
  published/prices/<eodhd_symbol>.json      {"symbol":..., "currency":..., "source":..., "series":[[date, close],...]}
"""

from __future__ import annotations

import io
import logging
import os
from datetime import date, datetime, timedelta, timezone

import pandas as pd

from .http import HttpClient, ProviderError
from .storage import Storage, read_json, supabase_base_url, supabase_headers, write_json

log = logging.getLogger(__name__)

ECB_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.{cur}.EUR.SP00.A"


def fetch_ecb(currencies: list[str], start: date, http: HttpClient | None = None) -> pd.DataFrame:
    http = http or HttpClient("ecb", min_interval=0.5)
    url = ECB_URL.format(cur="+".join(currencies)) + f"?format=csvdata&startPeriod={start.isoformat()}"
    r = http.request("GET", url, headers={"Accept": "text/csv"})
    df = pd.read_csv(io.StringIO(r.text))
    out = df[["CURRENCY", "TIME_PERIOD", "OBS_VALUE"]].rename(
        columns={"CURRENCY": "currency", "TIME_PERIOD": "date", "OBS_VALUE": "rate"})
    out["rate"] = pd.to_numeric(out["rate"], errors="coerce")
    return out.dropna()


def update_fx(storage: Storage, now: datetime, currencies=("USD", "GBP", "CHF")) -> dict:
    df = fetch_ecb(list(currencies), (now - timedelta(days=800)).date())
    rates = {c: [[d, float(v)] for d, v in g.sort_values("date")[["date", "rate"]].itertuples(index=False)]
             for c, g in df.groupby("currency")}
    asof = max(r[-1][0] for r in rates.values()) if rates else None
    write_json(storage, "published/fx/ecb.json", {
        "base": "EUR", "quote": "units of currency per 1 EUR", "source": "ECB euro reference rates",
        "asof": asof, "updated_at": now.isoformat(timespec="seconds"), "rates": rates})
    return {"asof": asof, "currencies": list(rates)}


def list_instruments() -> list[dict]:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
    if not (url and key):
        return []
    http = HttpClient("supabase-rest")
    headers = supabase_headers(key)
    rows = http.get_json(f"{supabase_base_url(url)}/rest/v1/instruments?select=eodhd_symbol,currency&eodhd_symbol=not.is.null",
                         headers=headers)
    seen, out = set(), []
    for r in rows:
        s = (r.get("eodhd_symbol") or "").strip().upper()
        if s and s not in seen:
            seen.add(s)
            out.append({"symbol": s, "currency": (r.get("currency") or "EUR").upper()})
    return out


def update_prices(storage: Storage, instruments: list[dict], now: datetime, api_key: str,
                  http: HttpClient | None = None) -> list[dict]:
    http = http or HttpClient("eodhd", min_interval=1.0)
    results = []
    for ins in instruments:
        sym = ins["symbol"]
        path = f"published/prices/{sym}.json"
        old = read_json(storage, path) or {"series": []}
        last = old["series"][-1][0] if old["series"] else None
        start = (date.fromisoformat(last) - timedelta(days=7)) if last else (now - timedelta(days=370)).date()
        try:
            data = http.get_json(f"https://eodhd.com/api/eod/{sym}?api_token={api_key}&fmt=json&from={start.isoformat()}")
        except ProviderError as e:
            results.append({"symbol": sym, "ok": False, "error": str(e)})
            continue
        merged = {d: c for d, c in old["series"]}
        for row in data:
            # RAW close: dividends/distributions are recorded as portfolio transactions,
            # so using adjusted prices would double count them.
            px = row.get("close")
            if px and px > 0:
                merged[row["date"]] = float(px)
        series = sorted([d, c] for d, c in merged.items())
        write_json(storage, path, {"symbol": sym, "currency": ins["currency"], "source": "EODHD (EOD)",
                                   "asof": series[-1][0] if series else None,
                                   "updated_at": now.isoformat(timespec="seconds"), "series": series})
        results.append({"symbol": sym, "ok": True, "asof": series[-1][0] if series else None, "points": len(series)})
    return results


def update_portfolio_prices(storage: Storage, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    out: dict = {}
    try:
        out["fx"] = update_fx(storage, now)
    except ProviderError as e:
        out["fx"] = {"error": str(e)}
    key = os.environ.get("EODHD_API_KEY")
    if not key:
        out["prices"] = {"skipped": "EODHD_API_KEY no configurada"}
        return out
    try:
        instruments = list_instruments()
    except ProviderError as e:
        out["prices"] = {"error": str(e)}
        return out
    if not instruments:
        out["prices"] = {"skipped": "sin instrumentos con eodhd_symbol"}
    else:
        out["prices"] = update_prices(storage, instruments[:9], now, key)  # 2 runs/day stay within the free daily quota
    return out
