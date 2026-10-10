"""Raw data lake: monthly Parquet files of raw daily bars + reference tables + state.

Layout (inside the Storage):
  lake/bars/YYYY-MM.parquet      raw grouped-daily bars (all tickers)
  lake/ref/tickers.parquet       ticker reference
  lake/ref/splits.parquet        split events
  lake/ref/dividends.parquet     dividend events
  lake/ref/fundamentals.parquet  SIC + shares outstanding
  lake/state.json                ingested sessions, provider, refresh timestamps
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

import pandas as pd

from .providers.base import BAR_COLUMNS, normalise_bars
from .storage import Storage, read_json, read_parquet, write_json, write_parquet


class Lake:
    def __init__(self, storage: Storage, prefix: str = "lake"):
        self.s = storage
        self.prefix = prefix

    # ------------------------------------------------------------- state
    def state(self) -> dict[str, Any]:
        return read_json(self.s, f"{self.prefix}/state.json") or {"sessions": [], "refreshed": {}}

    def save_state(self, state: dict[str, Any]) -> None:
        state["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        write_json(self.s, f"{self.prefix}/state.json", state, gz=False)

    def ingested_sessions(self) -> set[date]:
        return {date.fromisoformat(d) for d in self.state().get("sessions", [])}

    # -------------------------------------------------------------- bars
    def upsert_bars(self, df: pd.DataFrame) -> None:
        if df.empty:
            return
        df = normalise_bars(df)
        for month, part in df.groupby(df["date"].dt.strftime("%Y-%m")):
            path = f"{self.prefix}/bars/{month}.parquet"
            old = read_parquet(self.s, path)
            merged = part if old is None else pd.concat([old, part], ignore_index=True)
            merged = (merged.drop_duplicates(["date", "ticker"], keep="last")
                      .sort_values(["date", "ticker"]).reset_index(drop=True))
            write_parquet(self.s, path, merged)

    def load_bars(self, start: date | None = None, tickers: set[str] | None = None) -> pd.DataFrame:
        files = [p for p in self.s.list(f"{self.prefix}/bars") if p.endswith(".parquet")]
        if start is not None:
            files = [p for p in files if p.rsplit("/", 1)[-1][:7] >= start.strftime("%Y-%m")]
        parts = []
        for p in sorted(files):
            df = read_parquet(self.s, p)
            if df is None or df.empty:
                continue
            if tickers is not None:
                df = df[df["ticker"].isin(tickers)]
            parts.append(df)
        if not parts:
            return pd.DataFrame(columns=BAR_COLUMNS)
        out = pd.concat(parts, ignore_index=True)
        if start is not None:
            out = out[out["date"] >= pd.Timestamp(start)]
        return out.reset_index(drop=True)

    # -------------------------------------------------------------- refs
    def write_ref(self, name: str, df: pd.DataFrame) -> None:
        write_parquet(self.s, f"{self.prefix}/ref/{name}.parquet", df)

    def read_ref(self, name: str) -> pd.DataFrame | None:
        return read_parquet(self.s, f"{self.prefix}/ref/{name}.parquet")

    def upsert_events(self, name: str, df: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
        old = self.read_ref(name)
        merged = df if old is None else pd.concat([old, df], ignore_index=True)
        if not merged.empty:
            merged["ex_date"] = pd.to_datetime(merged["ex_date"]).dt.date
            merged = merged.drop_duplicates(keys, keep="last").sort_values(keys).reset_index(drop=True)
        self.write_ref(name, merged)
        return merged
