"""Point-in-time indicators.

`indicators_at(P, t, ...)` only reads rows <= t of the panels, so the same function
is used for the live ranking, rank history and backtests without look-ahead.
All computations are vectorised across tickers.
"""

from __future__ import annotations

import warnings

import numpy as np
import pandas as pd

from .panels import Panels

SQRT252 = np.sqrt(252.0)


def _win(a: np.ndarray, t: int, n: int) -> np.ndarray:
    """Rows (t-n, t] i.e. n rows ending at t inclusive; NaN-padded if not enough history."""
    lo = t - n + 1
    if lo >= 0:
        return a[lo : t + 1]
    pad = np.full((-lo,) + a.shape[1:], np.nan)
    return np.concatenate([pad, a[: t + 1]])


def _at(a: np.ndarray, t: int) -> np.ndarray:
    return a[t] if t >= 0 else np.full(a.shape[1:], np.nan)


def ret(close_ff: np.ndarray, t: int, h: int, skip: int = 0) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        return _at(close_ff, t - skip) / _at(close_ff, t - h) - 1.0


def nanstd(x: np.ndarray, min_frac: float = 0.8) -> np.ndarray:
    ok = np.isfinite(x)
    cnt = ok.sum(0)
    with np.errstate(invalid="ignore", divide="ignore"):
        out = np.nanstd(np.where(ok, x, np.nan), axis=0, ddof=1)
    out[cnt < max(2, int(min_frac * x.shape[0]))] = np.nan
    return out


def nanmean_strict(x: np.ndarray, min_frac: float = 0.8) -> np.ndarray:
    ok = np.isfinite(x)
    with np.errstate(invalid="ignore"):
        out = np.nanmean(np.where(ok, x, np.nan), axis=0)
    out[ok.sum(0) < max(1, int(min_frac * x.shape[0]))] = np.nan
    return out


def sma(close_ff: np.ndarray, t: int, n: int) -> np.ndarray:
    return nanmean_strict(_win(close_ff, t, n), 0.95)


def theil_sen(y: np.ndarray) -> np.ndarray:
    """Median of pairwise slopes per column (robust to single-session spikes)."""
    w = y.shape[0]
    i, j = np.triu_indices(w, 1)
    with np.errstate(invalid="ignore"):
        s = (y[j] - y[i]) / (j - i)[:, None]
        out = np.nanmedian(s, axis=0) if np.isfinite(s).any() else np.full(y.shape[1], np.nan)
    out[np.isfinite(y).sum(0) < int(0.8 * w)] = np.nan
    return out


def ols_trend(logp: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Slope and R^2 of log price on time (columns with NaN -> NaN)."""
    n = logp.shape[0]
    x = np.arange(n, dtype=float)
    xc = x - x.mean()
    yc = logp - logp.mean(0)
    sxy = (xc[:, None] * yc).sum(0)
    sxx = (xc**2).sum()
    syy = (yc**2).sum(0)
    with np.errstate(invalid="ignore", divide="ignore"):
        slope = sxy / sxx
        r2 = sxy**2 / (sxx * syy)
    bad = ~np.isfinite(logp).all(0)
    slope[bad] = np.nan
    r2[bad] = np.nan
    return slope, r2


def max_drawdown(prices: np.ndarray) -> np.ndarray:
    peak = np.fmax.accumulate(np.where(np.isfinite(prices), prices, -np.inf), axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        dd = 1.0 - prices / peak
    out = np.nanmax(np.where(np.isfinite(dd), dd, np.nan), axis=0)
    return out


def atr_panel(P: Panels, n: int) -> np.ndarray:
    """Simple-average true range (adjusted prices); NaN where bars missing."""
    prev_c = np.vstack([np.full((1, P.close.shape[1]), np.nan), P.close_ff[:-1]])
    hi = np.where(np.isfinite(P.high), P.high, P.close)
    lo = np.where(np.isfinite(P.low), P.low, P.close)
    tr = np.fmax(hi - lo, np.fmax(np.abs(hi - prev_c), np.abs(lo - prev_c)))
    return pd.DataFrame(tr).rolling(n, min_periods=int(n * 0.8)).mean().to_numpy(copy=True)


def sma_panel(close_ff: np.ndarray, n: int) -> np.ndarray:
    return pd.DataFrame(close_ff).rolling(n, min_periods=int(n * 0.95)).mean().to_numpy()


class Precomputed:
    """Rolling panels computed once (each value at t uses rows <= t only)."""

    def __init__(self, P: Panels, w: dict[str, int]):
        self.atr = atr_panel(P, w["atr"])
        self.sma50 = sma_panel(P.close_ff, 50)
        self.sma200 = sma_panel(P.close_ff, 200)
        with np.errstate(invalid="ignore", divide="ignore"):
            self.atr_pct = self.atr / P.close_ff
            self.dist200 = P.close_ff / self.sma200 - 1.0
        self.vol_avg50 = pd.DataFrame(P.volume).rolling(50, min_periods=40).mean().to_numpy()
        self.max126 = pd.DataFrame(P.close_ff).rolling(126, min_periods=120).max().to_numpy()
        self.above50 = np.where(np.isfinite(self.sma50), P.close_ff > self.sma50, False)


def indicators_at(P: Panels, pre: Precomputed, t: int, w: dict[str, int], bench_col: int,
                  cls_cfg: dict, cols: np.ndarray | None = None) -> pd.DataFrame:
    """Raw indicators for every ticker (or `cols`) at session index t."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return _indicators_at(P, pre, t, w, bench_col, cls_cfg, cols)


def _indicators_at(P: Panels, pre: Precomputed, t: int, w: dict[str, int], bench_col: int,
                   cls_cfg: dict, cols: np.ndarray | None = None) -> pd.DataFrame:
    cols = np.arange(len(P.tickers)) if cols is None else cols
    C = P.close_ff[:, cols]
    R = P.logret[:, cols]
    skip, m12, m6 = w["skip"], w["m12"], w["m6"]
    rm = P.logret[:, bench_col]
    out: dict[str, np.ndarray] = {}

    px = C[t]
    out["price"] = P.raw_close[t, cols]
    out["present"] = P.present[t, cols]
    out["chg_1d"] = ret(C, t, 1)
    for k, h in (("r1m", w["m1"]), ("r3m", w["m3"]), ("r6m", w["m6"]), ("r12m", w["m12"])):
        out[k] = ret(C, t, h)
    out["r12_1"] = ret(C, t, m12, skip)
    out["r6_1"] = ret(C, t, m6, skip)
    out["ytd"] = np.full(len(cols), np.nan)
    y0 = np.where(P.dates.year < P.dates[t].year)[0]
    if len(y0):
        out["ytd"] = ret(C, t, t - y0[-1])

    vol252 = nanstd(_win(R, t, w["vol_long"])) * SQRT252
    vol63 = nanstd(_win(R, t, w["vol_short"])) * SQRT252
    out["vol_252"], out["vol_63"] = vol252, vol63
    with np.errstate(invalid="ignore", divide="ignore"):
        out["mom_12_1_riskadj"] = out["r12_1"] / vol252
        out["mom_6_1_riskadj"] = out["r6_1"] / vol252

    # --- Trend quality
    win_c = _win(R, t - skip, m12 - skip)  # returns from t-252 .. t-21
    ok = np.isfinite(win_c)
    n_ok = ok.sum(0)
    with np.errstate(invalid="ignore", divide="ignore"):
        pos = np.where(ok, win_c > 0, False).sum(0) / n_ok
        neg = np.where(ok, win_c < 0, False).sum(0) / n_ok
    out["pct_up_days"] = pos
    # Long-only path quality: share of up days minus share of down days over the 12-1 window.
    # For winners this equals -ID of Da, Gurun & Warachka (2014). It is NOT multiplied by
    # sign(R12-1): that would give a smooth, steady LOSER the same high score as a smooth winner.
    out["consistency"] = pos - neg
    slope, r2 = ols_trend(np.log(_win(C, t, w["r2"])))
    out["trend_slope_126"] = slope * 252
    out["r2_126"] = r2
    out["signed_r2"] = r2 * np.sign(slope)
    s50, s200 = pre.sma50[t, cols], pre.sma200[t, cols]
    s50_prev, s200_prev = _at(pre.sma50, t - 10)[cols], _at(pre.sma200, t - 21)[cols]
    checks = np.vstack([px > s50, px > s200, s50 > s200, s200 > s200_prev, s50 > s50_prev])
    ma = checks.sum(0).astype(float)
    ma[~(np.isfinite(s50) & np.isfinite(s200) & np.isfinite(s200_prev))] = np.nan
    out["sma20"] = sma(C, t, 20)
    out["sma50"], out["sma100"], out["sma200"] = s50, sma(C, t, 100), s200
    out["ma_structure"] = ma
    hi_src = np.where(np.isfinite(P.high[:, cols]), P.high[:, cols], C)
    hi52 = np.nanmax(_win(hi_src, t, w["high52"]), axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        out["high52_proximity"] = px / hi52
        out["dist_52w_high"] = 1.0 - px / hi52
        for n in (20, 50, 100, 200):
            out[f"px_vs_sma{n}"] = px / out[f"sma{n}"] - 1.0

    # --- Relative strength vs primary benchmark
    bench = P.close_ff[:, bench_col]
    with np.errstate(invalid="ignore", divide="ignore"):
        rs = np.log(C / bench[:, None])
    rs_recent = theil_sen(_win(rs, t, w["rs_recent"]))
    rs_prior = theil_sen(_win(rs, t - w["rs_recent"], w["rs_prior"]))
    daily_vol = vol63 / SQRT252
    with np.errstate(invalid="ignore", divide="ignore"):
        out["rs_slope_change"] = (rs_recent - rs_prior) / daily_vol
    # expressed as log-change per 21 sessions (robust slope x 21)
    out["rs_slope_21"] = rs_recent * 21
    out["rs_slope_prior"] = rs_prior * 21

    # --- Risk
    out["atr_pct"] = pre.atr_pct[t, cols]
    out["maxdd_252"] = max_drawdown(_win(C, t, 252))
    out["dd_now"] = 1.0 - px / np.nanmax(_win(C, t, 252), axis=0)
    rw = _win(R, t, w["beta"])
    mw = _win(rm[:, None], t, w["beta"])[:, 0]
    mask = np.isfinite(rw) & np.isfinite(mw)[:, None]
    cnt = mask.sum(0)
    mx = np.where(mask, mw[:, None], 0.0)
    rx = np.where(mask, rw, 0.0)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean_m = mx.sum(0) / cnt
        mean_r = rx.sum(0) / cnt
        cov = (np.where(mask, (rx - mean_r) * (mx - mean_m), 0.0)).sum(0) / (cnt - 1)
        var_m = (np.where(mask, (mx - mean_m) ** 2, 0.0)).sum(0) / (cnt - 1)
        beta = cov / var_m
    beta[cnt < 0.8 * w["beta"]] = np.nan
    out["beta_252"] = beta
    # Residual (leadership) momentum over t-252..t-21: beta-adjusted, vol-scaled.
    res_win = _win(R, t - skip, m12 - skip) - beta[None, :] * _win(rm[:, None], t - skip, m12 - skip)
    res_sd = nanstd(res_win)
    res_sd[res_sd < 1e-8] = np.nan  # no idiosyncratic variance: leadership undefined
    with np.errstate(invalid="ignore", divide="ignore"):
        out["residual_mom"] = np.nansum(res_win, 0) / (res_sd * np.sqrt(m12 - skip))
    out["residual_mom"][np.isfinite(res_win).sum(0) < 0.8 * (m12 - skip)] = np.nan

    g = w["gap"]
    O = P.open[:, cols]
    prev_c = _win(C, t - 1, g)
    opens = _win(O, t, g)
    prev_atr = _win(pre.atr_pct[:, cols], t - 1, g)
    with np.errstate(invalid="ignore", divide="ignore"):
        gap = np.abs(opens / prev_c - 1.0)
    gaps = np.where(np.isfinite(gap) & np.isfinite(prev_atr), gap > 2 * prev_atr, False)
    gf = gaps.sum(0) / g
    gf[np.isfinite(opens).sum(0) < 0.8 * g] = np.nan
    out["gap_freq"] = gf
    cw = np.abs(_win(R, t, w["concentration"]))
    srt = np.sort(np.where(np.isfinite(cw), cw, 0.0), axis=0)
    with np.errstate(invalid="ignore", divide="ignore"):
        conc = srt[-5:].sum(0) / srt.sum(0)
    conc[np.isfinite(cw).sum(0) < 0.8 * w["concentration"]] = np.nan
    out["concentration"] = conc

    # --- Liquidity
    dv = _win(P.dollar_volume[:, cols], t, 63)
    out["adv_63"] = nanmean_strict(dv, 0.6)
    out["rel_volume"] = nanmean_strict(_win(P.volume[:, cols], t, 5), 0.6) / pre.vol_avg50[t, cols]

    # --- Extension
    with np.errstate(invalid="ignore", divide="ignore"):
        out["atr_above_sma50"] = (px - s50) / pre.atr[t, cols]
    out["dist200"] = pre.dist200[t, cols]
    hist = pre.dist200[: t + 1, cols]
    n_hist = np.isfinite(hist).sum(0)
    with np.errstate(invalid="ignore"):
        q = np.nanquantile(np.where(np.isfinite(hist), hist, np.nan), cls_cfg["extended"]["dist200_own_percentile"], axis=0) \
            if hist.shape[0] else np.full(len(cols), np.nan)
    q[n_hist < cls_cfg["extended"]["min_own_history"]] = np.nan
    out["dist200_own_q"] = q

    # --- Breakout detection (close above prior 126d max within last N sessions, with volume)
    bc = cls_cfg["breakout"]
    breakout = np.zeros(len(cols), dtype=bool)
    breakout_vol = np.full(len(cols), np.nan)
    breakout_days_ago = np.full(len(cols), np.nan)
    for k in range(bc["recent_sessions"]):
        s = t - k
        if s - 1 < 0:
            break
        prior_max = pre.max126[s - 1, cols]
        cond = np.where(np.isfinite(prior_max), C[s] > prior_max, False)
        with np.errstate(invalid="ignore", divide="ignore"):
            vmult = P.volume[s, cols] / pre.vol_avg50[s - 1, cols]
        cw40 = _win(C, s - 1, bc["consolidation_window"])
        with np.errstate(invalid="ignore", divide="ignore"):
            rng40 = (np.nanmax(cw40, 0) - np.nanmin(cw40, 0)) / pre.atr[s - 1, cols]
        ok_b = cond & (vmult >= bc["volume_multiple"]) & (rng40 <= bc["consolidation_max_atr"])
        newly = ok_b & ~breakout
        breakout_vol[newly] = vmult[newly]
        breakout_days_ago[newly] = k
        breakout |= ok_b
    out["breakout"] = breakout
    out["breakout_vol_mult"] = breakout_vol
    out["breakout_days_ago"] = breakout_days_ago
    out["new_52w_high"] = np.where(np.isfinite(hi52), C[t] >= np.nanmax(_win(C, t, 252), axis=0) * 0.999, False)

    # --- SMA50 regime change: a recent cross below the SMA50 (within the last `cross_recent`
    # sessions, still below today) after >= `sma50_days_above` consecutive sessions above it.
    wk = cls_cfg["weakening"]
    ab = pre.above50[:, cols]
    n_above = wk["sma50_days_above"]
    recent = wk.get("cross_recent", 1)
    cross = np.zeros(len(cols), dtype=bool)
    still_below = np.ones(len(cols), dtype=bool)
    for k in range(recent):
        s = t - k
        if s - n_above < 0:
            break
        still_below &= ~ab[s]
        above_before = ab[s - n_above : s].all(axis=0)
        cross |= still_below & above_before
    out["sma50_cross_down"] = cross

    # --- Data quality on the history window
    hw = 273
    pres = _win(P.present[:, cols].astype(float), t, hw)
    out["history_sessions"] = np.nansum(_win(P.present[:, cols].astype(float), t, t + 1), 0)
    out["missing_frac"] = 1.0 - np.nansum(pres, 0) / np.minimum(hw, out["history_sessions"]).clip(min=1)
    rr = _win(R, t, hw)
    simple = np.expm1(rr)
    nxt = np.vstack([simple[1:], np.full((1, simple.shape[1]), np.nan)])
    with np.errstate(invalid="ignore"):
        bad = (np.abs(simple) > 0.25) & (simple * nxt < 0) & (np.abs((1 + simple) * (1 + nxt) - 1) < 0.05)
    out["bad_ticks"] = np.where(np.isfinite(simple), bad, False).sum(0)
    with np.errstate(invalid="ignore"):
        out["extreme_moves"] = (np.abs(simple) > 0.5).sum(0)

    df = pd.DataFrame(out, index=pd.Index(P.tickers[cols], name="ticker"))
    return df
