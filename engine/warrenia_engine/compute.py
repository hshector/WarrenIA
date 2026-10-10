"""Scoring orchestration for one session: eligibility -> scores -> states -> reasons.

Also produces rank history (recomputed from prices, point-in-time), sensitivity
analysis and component correlations for the methodology page.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .config import Config
from .indicators import Precomputed, indicators_at
from .panels import Panels
from .scoring import classify, overall, pct_rank, score_universe
from .sectors import sic_to_sector
from .universe import classify_assets, eligibility

log = logging.getLogger(__name__)

CLASSES = ("stock", "etf")


@dataclass
class Context:
    cfg: Config
    P: Panels
    pre: Precomputed
    ref: pd.DataFrame              # ticker reference indexed by ticker
    cls: pd.Series                 # ticker -> stock | etf | None
    shares: pd.Series              # ticker -> shares outstanding (may be NaN)
    sector: pd.Series              # ticker -> sector name (stocks; may be None)
    bench_col: int
    cols: dict[str, np.ndarray] = field(default_factory=dict)
    _cache: dict[int, pd.DataFrame] = field(default_factory=dict)

    @property
    def all_cols(self) -> np.ndarray:
        return np.unique(np.concatenate([self.cols[c] for c in CLASSES]))

    def indicators(self, t: int) -> pd.DataFrame:
        if t not in self._cache:
            self._cache[t] = indicators_at(self.P, self.pre, t, self.cfg.windows, self.bench_col,
                                           self.cfg.momentum["classification"], self.all_cols)
        return self._cache[t]


def build_context(cfg: Config, P: Panels, tickers: pd.DataFrame, fundamentals: pd.DataFrame | None) -> Context:
    ref = tickers.drop_duplicates("ticker", keep="last").set_index("ticker")
    cls = classify_assets(tickers.drop_duplicates("ticker", keep="last"), cfg.universe)
    if fundamentals is not None and not fundamentals.empty:
        f = fundamentals.drop_duplicates("ticker", keep="last").set_index("ticker")
        shares = pd.to_numeric(f["shares"], errors="coerce")
        sector = f["sic"].map(sic_to_sector)
    else:
        shares = pd.Series(dtype=float)
        sector = pd.Series(dtype=object)
    pre = Precomputed(P, cfg.windows)
    bench_col = P.col(cfg.primary_benchmark)
    ctx = Context(cfg, P, pre, ref, cls, shares, sector, bench_col)
    for c in CLASSES:
        ctx.cols[c] = np.array([i for i, tk in enumerate(P.tickers) if cls.get(tk) == c], dtype=int)
    return ctx


@dataclass
class ClassResult:
    cls: str
    ind: pd.DataFrame          # indicators of all candidates of the class
    elig: pd.DataFrame         # eligibility table (eligible, reasons)
    scores: pd.DataFrame       # scores of eligible assets (index = ticker)
    states: dict[str, dict]


def evaluate(ctx: Context, t: int, with_states: bool = True, weights_override: dict | None = None) -> dict[str, ClassResult]:
    cfg = ctx.cfg
    ind_all = ctx.indicators(t)
    lb = cfg.windows["accel_lookback"]
    prev_all = ctx.indicators(t - lb) if t - lb >= 0 else None
    out: dict[str, ClassResult] = {}
    names = ctx.ref["name"] if "name" in ctx.ref else pd.Series(dtype=object)
    for c in CLASSES:
        tks = ctx.P.tickers[ctx.cols[c]]
        ind = ind_all.loc[ind_all.index.intersection(tks)]
        mcap = ctx.shares.reindex(ind.index) * ind["price"]
        el = eligibility(ind, ctx.cls, names, mcap, cfg.universe)
        E = el.index[el["eligible"]] if len(el) else pd.Index([])
        sc = score_universe(ind.loc[E], cfg.momentum,
                            prev_all.loc[E] if prev_all is not None else None,
                            weights_override=weights_override)
        # Assets whose metrics could not be scored are excluded with an explicit reason.
        no_score = sc.index[sc["overall"].isna()]
        if len(no_score):
            for tk in no_score:
                el.at[tk, "eligible"] = False
                el.at[tk, "reasons"] = list(el.at[tk, "reasons"]) + ["metrics"]
            sc = score_universe(ind.loc[el.index[el["eligible"]]], cfg.momentum,
                                prev_all.loc[el.index[el["eligible"]]] if prev_all is not None else None,
                                weights_override=weights_override)
        states = {}
        if with_states:
            for tk in sc.index:
                states[tk] = classify(ind.loc[tk], sc.loc[tk], cfg.momentum)
        out[c] = ClassResult(c, ind, el, sc, states)
    return out


def history_indices(ctx: Context, t: int) -> list[int]:
    rh = ctx.cfg.momentum["rank_history"]
    min_t = ctx.cfg.universe["stocks"]["min_history_sessions"] + ctx.cfg.windows["accel_lookback"]
    idx = set(range(max(t - rh["daily_sessions"] + 1, min_t), t + 1))
    k = t
    while k >= max(t - rh["weekly_back"], min_t):
        idx.add(k)
        k -= 5
    return sorted(i for i in idx if i >= min_t)


def rank_history(ctx: Context, t: int) -> dict[str, pd.DataFrame]:
    """Overall rank and score per date (rows) and ticker (cols), per class."""
    hist: dict[str, dict] = {c: {} for c in CLASSES}
    dates = history_indices(ctx, t)
    for i, ti in enumerate(dates):
        res = evaluate(ctx, ti, with_states=False)
        for c in CLASSES:
            sc = res[c].scores
            hist[c][ctx.P.dates[ti]] = sc[["rank", "overall", "momentum"]]
        # keep the cache bounded: drop entries no future date needs
        keep = {d for d in dates[i + 1 :]} | {d - ctx.cfg.windows["accel_lookback"] for d in dates[i + 1 :]} | {t}
        for k in list(ctx._cache):
            if k not in keep:
                del ctx._cache[k]
    out = {}
    for c in CLASSES:
        frames = {d: df["rank"] for d, df in hist[c].items()}
        ovs = {d: df["overall"] for d, df in hist[c].items()}
        out[c] = (pd.DataFrame(frames).T.sort_index(), pd.DataFrame(ovs).T.sort_index())
    return out


def sensitivity(scores: pd.DataFrame, ow: dict, cfg: dict) -> dict:
    """Dirichlet perturbation of overall weights; Spearman and top-N overlap vs base."""
    rng = np.random.default_rng(cfg["seed"])
    keys = list(ow)
    base_w = np.array([ow[k] for k in keys])
    base = overall(scores, ow)
    n = cfg["top_n"]
    base_top = set(base.sort_values(ascending=False).index[:n])
    rhos, overlaps = [], []
    for _ in range(cfg["samples"]):
        w = rng.dirichlet(base_w * cfg["concentration"])
        alt = overall(scores, dict(zip(keys, w)))
        rhos.append(base.rank().corr(alt.rank()))
        overlaps.append(len(base_top & set(alt.sort_values(ascending=False).index[:n])) / n)
    rhos, overlaps = np.array(rhos), np.array(overlaps)
    return {
        "samples": cfg["samples"], "concentration": cfg["concentration"], "top_n": n,
        "spearman": {"median": float(np.median(rhos)), "p05": float(np.quantile(rhos, 0.05))},
        "topn_overlap": {"median": float(np.median(overlaps)), "p05": float(np.quantile(overlaps, 0.05)),
                         "min": float(overlaps.min())},
        "target_median_topn_overlap": cfg["target_median_topn_overlap"],
        "passes_target": bool(np.median(overlaps) >= cfg["target_median_topn_overlap"]),
    }


def component_correlation(ind: pd.DataFrame, keys: list[str], threshold: float = 0.8) -> dict:
    """Rank correlations between components; pairs above `threshold` are flagged for review
    (possible double counting)."""
    ranks = pd.DataFrame({k: pct_rank(ind[k]) for k in keys})
    corr = ranks.corr(method="pearson")
    high = []
    for a in range(len(keys)):
        for b in range(a + 1, len(keys)):
            v = corr.iat[a, b]
            if np.isfinite(v) and abs(v) >= threshold:
                high.append({"a": keys[a], "b": keys[b], "rho": round(float(v), 3)})
    return {"labels": keys, "threshold": threshold, "high_pairs": high,
            "matrix": [[None if not np.isfinite(v) else round(float(v), 3) for v in row] for row in corr.to_numpy()]}
