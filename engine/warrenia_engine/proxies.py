"""How each asset class behaves, measured on liquid US-listed proxies (daily closes).

These numbers describe the past ~2 years only (the data plan's window). They are shown to
explain what an asset does in a portfolio (how much it swings, how deep it falls, whether it
moves with stocks), never as a forecast.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .panels import Panels


def proxy_stats(P: Panels, t: int, bench: str, proxies: dict[str, str], window: int = 504) -> dict[str, dict]:
    out: dict[str, dict] = {}
    if not P.has(bench):
        return out
    lo = max(0, t - window + 1)
    idx = P.dates[lo : t + 1]
    b = pd.Series(P.close_ff[lo : t + 1, P.col(bench)], index=idx)
    b_m = b.resample("ME").last().pct_change().dropna()
    b_d = np.log(b).diff()
    for tk, label in proxies.items():
        if not P.has(tk):
            continue
        s = pd.Series(P.close_ff[lo : t + 1, P.col(tk)], index=idx).dropna()
        if len(s) < 120:
            continue
        years = (s.index[-1] - s.index[0]).days / 365.25
        r = np.log(s).diff()
        both = pd.concat([r, b_d], axis=1).dropna()
        corr = float(both.iloc[:, 0].corr(both.iloc[:, 1])) if len(both) > 60 else np.nan
        beta = float(np.cov(both.iloc[:, 0], both.iloc[:, 1], ddof=1)[0, 1] / both.iloc[:, 1].var(ddof=1)) if len(both) > 60 else np.nan
        m = s.resample("ME").last().pct_change().dropna()
        mm = pd.concat([m, b_m], axis=1).dropna()
        down = mm[mm.iloc[:, 1] < 0]
        out[tk] = {
            "label": label, "from": s.index[0].date().isoformat(), "years": round(years, 2),
            "ann_return": float((s.iloc[-1] / s.iloc[0]) ** (1 / years) - 1) if years > 0.5 else np.nan,
            "vol": float(r.std(ddof=1) * np.sqrt(252)),
            "max_drawdown": float((1 - s / s.cummax()).max()),
            "corr_stocks": corr, "beta_stocks": beta,
            "worst_month": float(m.min()) if len(m) else np.nan,
            # Average monthly return in the months the stock market fell: does it cushion falls?
            "when_stocks_fall": float(down.iloc[:, 0].mean()) if len(down) >= 3 else np.nan,
            "stocks_when_fall": float(down.iloc[:, 1].mean()) if len(down) >= 3 else np.nan,
            "down_months": int(len(down)),
        }
    return out
