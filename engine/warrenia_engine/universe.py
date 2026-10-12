"""Point-in-time eligibility. Every excluded asset keeps a human-readable reason."""

from __future__ import annotations

import re

import numpy as np
import pandas as pd

REASONS = {
    "type": "Not a covered instrument type",
    "stale": "Did not trade in the last session (stale price)",
    "price": "Price below the minimum",
    "adv": "Too little trading (average daily value)",
    "mcap": "Company too small",
    "mcap_unknown": "Company size unknown and not liquid enough to compensate",
    "history": "Not enough price history",
    "missing": "Too many days without data",
    "bad_tick": "Bad price detected (a spike that reverses the next day)",
    "leveraged": "Leveraged or inverse ETF",
    "metrics": "Not enough data to score",
}


def classify_assets(tickers: pd.DataFrame, universe_cfg: dict) -> pd.Series:
    """Map ticker -> 'stock' | 'etf' | None based on reference type / exchange."""
    s_types = set(universe_cfg["stocks"]["types"])
    if not universe_cfg["stocks"].get("include_adrs", True):
        s_types.discard("ADRC")
    e_types = set(universe_cfg["etfs"]["types"])
    exch = set(universe_cfg["stocks"]["exchanges"])
    t = tickers.set_index("ticker")
    cls = pd.Series(None, index=t.index, dtype="object")
    in_ex = t["exchange"].isin(exch) | t["exchange"].isna()
    cls[t["type"].isin(s_types) & in_ex] = "stock"
    cls[t["type"].isin(e_types)] = "etf"
    return cls


def eligibility(ind: pd.DataFrame, cls: pd.Series, names: pd.Series, mcap: pd.Series,
                universe_cfg: dict) -> pd.DataFrame:
    """Return DataFrame [ticker] -> eligible(bool), reasons(list[str]) for stock/etf tickers."""
    rows = []
    lev = re.compile(universe_cfg["etfs"]["exclude_name_regex"].strip())
    for tk in ind.index:
        c = cls.get(tk)
        if c not in ("stock", "etf"):
            continue
        u = universe_cfg["stocks" if c == "stock" else "etfs"]
        r = ind.loc[tk]
        reasons: list[str] = []
        if not bool(r["present"]):
            reasons.append("stale")
        if not (r["price"] >= u["min_price"]):
            reasons.append("price")
        if r["history_sessions"] < u["min_history_sessions"]:
            reasons.append("history")
        elif r["missing_frac"] > u["max_missing_fraction"]:
            reasons.append("missing")
        if r["bad_ticks"] > 0:
            reasons.append("bad_tick")
        adv = r["adv_63"]
        if c == "stock":
            m = mcap.get(tk, np.nan)
            if np.isfinite(m):
                if not (adv >= u["min_adv_usd"]):
                    reasons.append("adv")
                if m < u["min_market_cap_usd"]:
                    reasons.append("mcap")
            else:
                if not (adv >= u["unknown_mcap_min_adv_usd"]):
                    reasons.append("mcap_unknown")
        else:
            if not (adv >= u["min_adv_usd"]):
                reasons.append("adv")
            if lev.search(str(names.get(tk, ""))):
                reasons.append("leveraged")
        rows.append({"ticker": tk, "cls": c, "eligible": not reasons, "reasons": reasons})
    return pd.DataFrame(rows).set_index("ticker") if rows else pd.DataFrame(columns=["cls", "eligible", "reasons"])
