"""Walk-forward backtest of simple, transparent momentum strategies.

Design choices (see docs/BACKTEST.md):
- Signals use `evaluate()` at the last session of each month with data <= t only.
- Execution at the OPEN of the next session (t+1); holdings are buy-and-hold until
  the next execution day (weights drift).
- Costs: `cost_bps` per side on traded notional (turnover counts buys + sells).
- Universe is point-in-time from grouped-daily bars (includes later-delisted names);
  a missing price after a holding's last bar keeps its last value (exit at last
  price). Market cap uses current shares outstanding (documented look-ahead).
- No parameter is tuned here; the methodology weights are the configured ones.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .compute import Context, evaluate

log = logging.getLogger(__name__)

STRATEGIES = {
    "pure_12_1": "Top N por retorno 12-1m (momentum clásico)",
    "risk_adjusted": "Top N por Momentum Score (12-1 y 6-1 ajustados por volatilidad)",
    "overall": "Top N por Overall Momentum Rank (metodología completa)",
    "overall_filtered": "Overall Rank excluyendo Risk > p80 y volatilidad > 60%",
    "candidates": "Top N solo entre «Candidatas» (lo que la app propone comprar: sin sobreextensión)",
    "candidates_buffer": "Candidatas con regla de mantener: compra en el 20 % superior, vende al salir del 50 % "
                         "superior o pasar a «Evitar» (el uso recomendado)",
    "ew_universe": "Equiponderado de todo el universo elegible (referencia pasiva)",
}

# Strategies that need the per-asset action (states + decide), computed only when used.
NEEDS_ACTIONS = {"candidates", "candidates_buffer"}


@dataclass
class BacktestConfig:
    top_n: int = 20
    cost_bps: float = 10.0
    rebalance: str = "M"


def rebalance_indices(P_dates: pd.DatetimeIndex, start_t: int, end_t: int) -> list[int]:
    """Last session of each COMPLETE month in [start_t, end_t-1] (t+1 needed to execute)."""
    s = pd.Series(np.arange(len(P_dates)), index=P_dates)
    s = s[(s >= start_t) & (s <= end_t - 1)]
    out = []
    for m in s.groupby([s.index.year, s.index.month]).max().to_numpy():
        m = int(m)
        if m + 1 <= end_t and P_dates[m + 1].month != P_dates[m].month:
            out.append(m)
    return out


def select(strategy: str, sc: pd.DataFrame, ind: pd.DataFrame, n: int, actions: dict | None = None,
           prev: list[str] | None = None) -> list[str]:
    if sc.empty:
        return []
    if strategy in NEEDS_ACTIONS:
        actions = actions or {}
        ranked = list(sc.sort_values("rank").index)
        cands = [tk for tk in ranked if actions.get(tk, {}).get("action") == "candidate"]
        if strategy == "candidates":
            return cands[:n]
        keep = [tk for tk in ranked if tk in set(prev or []) and actions.get(tk, {}).get("hold")]
        out = keep[:n]
        out += [tk for tk in cands if tk not in out][: n - len(out)]
        return out
    if strategy == "pure_12_1":
        order = ind.loc[sc.index, "r12_1"].dropna().sort_values(ascending=False)
        return list(order.index[:n])
    if strategy == "risk_adjusted":
        return list(sc["momentum"].dropna().sort_values(ascending=False).index[:n])
    if strategy == "overall":
        return list(sc.sort_values("rank").index[:n])
    if strategy == "overall_filtered":
        ok = sc[(sc["risk"] <= 80) & (ind.loc[sc.index, "vol_63"] < 0.60)]
        return list(ok.sort_values("rank").index[:n])
    if strategy == "ew_universe":
        return list(sc.index)
    raise ValueError(strategy)


def signals(ctx: Context, rebal: list[int], strategies: list[str], n: int) -> dict[str, dict[int, list[str]]]:
    out: dict[str, dict[int, list[str]]] = {s: {} for s in strategies}
    prev: dict[str, list[str]] = {s: [] for s in strategies}
    need_actions = bool(NEEDS_ACTIONS & set(strategies))
    for t in rebal:
        res = evaluate(ctx, t, with_states=need_actions)["stock"]
        for s in strategies:
            out[s][t] = select(s, res.scores, res.ind, n, res.actions, prev[s])
            prev[s] = out[s][t]
        ctx._cache.clear()
    return out


def simulate(ctx: Context, picks: dict[int, list[str]], end_t: int, cost_bps: float) -> pd.DataFrame:
    """Daily portfolio returns from execution of the first signal to end_t."""
    P = ctx.P
    O = np.where(np.isfinite(P.open), P.open, P.close_ff)
    C = P.close_ff
    rebal = sorted(picks)
    exec_days = [t + 1 for t in rebal]
    col = {tk: i for i, tk in enumerate(P.tickers)}
    rets, turn, costs, npos, days = [], [], [], [], []
    w_prev: dict[str, float] = {}
    hold: dict[str, float] = {}  # current value per ticker (portfolio value normalised daily)
    last_px: dict[str, float] = {}
    for k, e in enumerate(exec_days):
        stop = exec_days[k + 1] if k + 1 < len(exec_days) else end_t + 1
        names = [tk for tk in picks[rebal[k]] if np.isfinite(O[e, col[tk]])]
        target = {tk: 1.0 / len(names) for tk in names} if names else {}
        # drifted weights at the open of e (value of old holdings at open prices)
        if hold:
            vals = {}
            for tk, v in hold.items():
                px = O[e, col[tk]] if np.isfinite(O[e, col[tk]]) else last_px[tk]
                vals[tk] = v * px / last_px[tk]
            tot = sum(vals.values())
            gap_ret = tot - 1.0  # overnight move from prev close to open
            w_prev = {tk: v / tot for tk, v in vals.items()} if tot > 0 else {}
        else:
            gap_ret = 0.0
        to = sum(abs(target.get(tk, 0) - w_prev.get(tk, 0)) for tk in set(target) | set(w_prev))
        cost = to * cost_bps / 1e4
        turn.append(to)
        costs.append(cost)
        hold = dict(target)
        last_px = {tk: O[e, col[tk]] for tk in hold}
        for d in range(e, stop):
            if not hold:
                r = 0.0
            else:
                tot = 0.0
                for tk in hold:
                    px = C[d, col[tk]]
                    px = px if np.isfinite(px) else last_px[tk]
                    hold[tk] = hold[tk] * px / last_px[tk]
                    last_px[tk] = px
                    tot += hold[tk]
                r = tot - 1.0
                hold = {tk: v / tot for tk, v in hold.items()}
            if d == e:
                r = (1 + gap_ret) * (1 + r) * (1 - cost) - 1
            rets.append(r)
            days.append(P.dates[d])
            npos.append(len(hold))
    df = pd.DataFrame({"ret": rets, "positions": npos}, index=pd.DatetimeIndex(days))
    df.attrs["turnover"] = turn
    df.attrs["costs"] = costs
    return df


def metrics(r: pd.Series, turnover: list[float] | None = None, costs: list[float] | None = None) -> dict:
    if r.empty:
        return {}
    eq = (1 + r).cumprod()
    years = len(r) / 252
    cagr = eq.iloc[-1] ** (1 / years) - 1 if years > 0 else np.nan
    vol = r.std(ddof=1) * np.sqrt(252)
    # Downside deviation over ALL observations (target 0): sqrt(mean(min(r, 0)^2)).
    down = float(np.sqrt(np.mean(np.minimum(r.to_numpy(), 0.0) ** 2)) * np.sqrt(252))
    dd = 1 - eq / eq.cummax()
    mdd = dd.max()
    out = {"total_return": eq.iloc[-1] - 1, "cagr": cagr, "vol": vol,
           "sharpe": (r.mean() * 252) / vol if vol > 0 else np.nan,  # rf = 0 (documented)
           "sortino": (r.mean() * 252) / down if down and down > 0 else np.nan,
           "max_drawdown": mdd, "calmar": cagr / mdd if mdd > 0 else np.nan, "days": len(r)}
    if turnover is not None:
        out["turnover_per_rebalance"] = float(np.mean(turnover[1:])) if len(turnover) > 1 else float(turnover[0])
        out["annual_turnover"] = out["turnover_per_rebalance"] * 12
        out["total_costs"] = float(np.sum(costs))
    return {k: (None if v is None or not np.isfinite(v) else round(float(v), 5)) for k, v in out.items()}


def regimes(ctx: Context, r: pd.Series) -> dict:
    P = ctx.P
    spy = pd.Series(P.close_ff[:, ctx.bench_col], index=P.dates)
    sma = spy.rolling(200, min_periods=190).mean()
    above = (spy.shift(1) > sma.shift(1)).reindex(r.index)
    vol = spy.pct_change().rolling(63).std().shift(1).reindex(r.index)
    terc = pd.qcut(vol.rank(method="first"), 3, labels=["baja", "media", "alta"]) if vol.notna().sum() > 30 else None
    out = {}
    for name, mask in (("SPY > SMA200", above == True), ("SPY < SMA200", above == False)):  # noqa: E712
        rr = r[mask.fillna(False)]
        out[name] = {"days": int(len(rr)), "ann_return": None if len(rr) < 20 else round(float(rr.mean() * 252), 4)}
    if terc is not None:
        for lab in ["baja", "media", "alta"]:
            rr = r[(terc == lab).fillna(False)]
            out[f"Volatilidad {lab}"] = {"days": int(len(rr)), "ann_return": None if len(rr) < 20 else round(float(rr.mean() * 252), 4)}
    return out


def run_backtest(ctx: Context, bt: BacktestConfig | None = None, start_t: int | None = None,
                 end_t: int | None = None) -> dict:
    bt = bt or BacktestConfig()
    P = ctx.P
    min_t = ctx.cfg.universe["stocks"]["min_history_sessions"] + ctx.cfg.windows["accel_lookback"]
    start_t = max(start_t or 0, min_t)
    end_t = end_t if end_t is not None else len(P.dates) - 1
    rebal = rebalance_indices(P.dates, start_t, end_t)
    if len(rebal) < 2:
        return {"status": "insufficient_history", "rebalances": len(rebal),
                "message": "Historial insuficiente para un backtest (se necesitan > 294 sesiones + 2 meses)."}
    strategies = list(STRATEGIES)
    sig = signals(ctx, rebal, strategies, bt.top_n)
    results, curves = {}, {}
    for s in strategies:
        df = simulate(ctx, sig[s], end_t, bt.cost_bps)
        m = metrics(df["ret"], df.attrs["turnover"], df.attrs["costs"])
        m["avg_positions"] = round(float(df["positions"].mean()), 1)
        m["regimes"] = regimes(ctx, df["ret"])
        results[s] = m
        curves[s] = df["ret"]
    first_exec = curves["overall"].index[0]
    for b in ctx.cfg.benchmark_tickers:
        if ctx.P.has(b):
            px = pd.Series(P.close_ff[:, P.col(b)], index=P.dates)
            r = px.pct_change().loc[first_exec:].iloc[1:]
            o = P.open[P.t_index(first_exec), P.col(b)]
            r = pd.concat([pd.Series([px.loc[first_exec] / o - 1], index=[first_exec]), r])
            results[f"bench_{b}"] = metrics(r)
            curves[f"bench_{b}"] = r
    # Sector exposure (average weight) of the main strategy.
    exp: dict[str, float] = {}
    for t, names in sig["overall"].items():
        for tk in names:
            sec = ctx.sector.get(tk)
            sec = sec if isinstance(sec, str) else "Sin sector"
            exp[sec] = exp.get(sec, 0) + 1 / max(len(names), 1) / len(sig["overall"])
    eq = pd.DataFrame({k: (1 + v).cumprod() for k, v in curves.items()}).ffill()
    weekly = eq.iloc[::5]
    if weekly.index[-1] != eq.index[-1]:
        weekly = pd.concat([weekly, eq.iloc[[-1]]])
    years = len(curves["overall"]) / 252
    conclusive = years >= 8 and len(rebal) >= 96
    return {
        "status": "ok", "conclusive": conclusive,
        "period": {"first_signal": P.dates[rebal[0]].date().isoformat(), "last_signal": P.dates[rebal[-1]].date().isoformat(),
                   "end": P.dates[end_t].date().isoformat(), "rebalances": len(rebal), "years": round(years, 2)},
        "settings": {"top_n": bt.top_n, "cost_bps_per_side": bt.cost_bps, "rebalance": "mensual (último día del mes)",
                     "execution": "apertura de la sesión siguiente", "weights": "equiponderado, deriva hasta el siguiente rebalanceo",
                     "risk_free": 0.0},
        "strategies": STRATEGIES, "results": results,
        "sector_exposure_overall": {k: round(v, 4) for k, v in sorted(exp.items(), key=lambda x: -x[1])},
        "last_holdings": {s: sig[s][rebal[-1]] for s in strategies if s != "ew_universe"},
        "curves": {"dates": [d.date().isoformat() for d in weekly.index],
                   "series": {k: [None if not np.isfinite(x) else round(float(x), 5) for x in weekly[k]] for k in weekly}},
        "limitations": [
            "Con el plan gratuito solo hay ~2 años de historia: tras los 294 días de calentamiento quedan ~12 rebalanceos, "
            "un único régimen de mercado y ninguna separación desarrollo/validación/test. Los resultados son "
            "exploratorios y NO concluyentes." if not conclusive else
            "Periodo largo: aun así, resultados pasados no garantizan resultados futuros.",
            "La capitalización usa las acciones en circulación actuales (pequeño sesgo de anticipación en el filtro de tamaño).",
            "El filtro de rentabilidad de las «Candidatas» usa el último beneficio anual publicado, no el conocido en cada fecha.",
            "Valores que dejan de cotizar se valoran a su último precio disponible.",
            "Sin impuestos ni tipo de cambio (rentabilidades en USD). Coste fijo por operación; sin impacto de mercado.",
            "Rentabilidad sin riesgo = 0 en el Sharpe.",
        ],
    }


def run_and_publish(storage, cfg, now: datetime | None = None) -> dict:
    from .compute import build_context
    from .lake import Lake
    from .panels import build_panels
    from .pipeline import HISTORY_SESSIONS, prefilter
    from .calendar import previous_sessions, sessions_between
    from .storage import write_json
    from .publish import clean

    now = now or datetime.now(timezone.utc)
    lake = Lake(storage)
    st = lake.state()
    sessions = sorted(pd.to_datetime(st.get("sessions", [])).date)
    if not sessions:
        raise RuntimeError("lake vacío")
    asof = sessions[-1]
    start = sessions[0]
    tickers = lake.read_ref("tickers")
    bars = lake.load_bars(start=start)
    bars = bars[bars["ticker"].isin(prefilter(bars, tickers, cfg))]
    P = build_panels(bars, lake.read_ref("splits"), lake.read_ref("dividends"), sessions=sessions_between(start, asof))
    ctx = build_context(cfg, P, tickers, lake.read_ref("fundamentals"))
    out = run_backtest(ctx)
    out["computed_at"] = now.isoformat(timespec="seconds")
    out["data_asof"] = asof.isoformat()
    out["config_hash"] = cfg.hash
    out["demo"] = str(st.get("provider", "")).startswith("synthetic")
    write_json(storage, "published/backtest/latest.json", clean(out))
    return {k: out[k] for k in ("status", "period", "results") if k in out}
