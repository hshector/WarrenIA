"""Build and write the immutable, versioned artifacts consumed by the web app.

  published/latest.json                     pointer to the newest successful run
  published/runs/<run_id>/meta.json         run metadata, coverage, methodology, QA
  published/runs/<run_id>/radar.json.gz     one row per eligible asset (stocks + ETFs)
  published/runs/<run_id>/excluded.json.gz  candidates excluded + reasons
  published/runs/<run_id>/market.json       breadth, benchmarks, sectors
  published/runs/<run_id>/assets/<S>.json.gz  detail per asset, sharded by first letter
"""

from __future__ import annotations

import logging
import math
from datetime import date, datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from .compute import CLASSES, ClassResult, Context, component_correlation, sensitivity
from .explain import LABELS, report, short_reasons
from .scoring import ACTIONS, STATES, pct_rank
from .storage import Storage, read_json, write_json
from .universe import REASONS

log = logging.getLogger(__name__)

SCHEMA_VERSION = 1
KEEP_RUNS = 7

ROW_FIELDS = {
    "price": "px", "chg_1d": "d1", "r1m": "r1m", "r3m": "r3m", "r6m": "r6m", "r12m": "r12m", "ytd": "ytd",
    "r12_1": "r12_1", "vol_63": "vol", "atr_pct": "atr", "maxdd_252": "mdd", "dd_now": "dd",
    "beta_252": "beta", "dist_52w_high": "d52", "adv_63": "adv", "rel_volume": "rvol",
    "px_vs_sma50": "s50", "px_vs_sma200": "s200",
}

DETAIL_INDICATORS = [
    "price", "chg_1d", "r1m", "r3m", "r6m", "r12m", "ytd", "r12_1", "r6_1", "vol_252", "vol_63",
    "mom_12_1_riskadj", "mom_6_1_riskadj", "consistency", "pct_up_days", "r2_126", "signed_r2",
    "trend_slope_126", "ma_structure", "sma20", "sma50", "sma100", "sma200", "px_vs_sma20", "px_vs_sma50",
    "px_vs_sma100", "px_vs_sma200", "high52_proximity", "dist_52w_high", "rs_slope_21", "rs_slope_prior",
    "rs_slope_change", "atr_pct", "maxdd_252", "dd_now", "beta_252", "residual_mom", "gap_freq",
    "concentration", "adv_63", "rel_volume", "atr_above_sma50", "dist200", "dist200_own_q",
    "breakout", "breakout_vol_mult", "breakout_days_ago", "new_52w_high", "history_sessions",
    "missing_frac", "bad_ticks", "extreme_moves", "mcap", "net_income", "pe", "profitable",
]


def clean(v: Any, sig: int = 6) -> Any:
    if isinstance(v, dict):
        return {k: clean(x, sig) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [clean(x, sig) for x in v]
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        f = float(v)
        if not math.isfinite(f):
            return None
        return float(f"{f:.{sig}g}")
    if isinstance(v, pd.Timestamp):
        return v.date().isoformat()
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


FUND_METRICS = [
    "fy_end", "revenue", "revenue_growth", "gross_margin", "operating_margin", "roa", "roe", "gross_profitability",
    "cfo", "fcf", "accruals", "share_change", "debt_assets", "interest_coverage", "fscore", "zscore",
    "ebit_ev", "fcf_yield", "earnings_yield", "pe", "pb", "shareholder_yield", "mcap", "net_income",
    "financial", "debt_reported", "fscore_signals", "standard", "currency",
]


def fundamentals_block(i: pd.Series, s: pd.Series, cfg, adr: bool = False) -> dict | None:
    """Everything the stock page needs to explain the fundamental verdict."""
    if not np.isfinite(i.get("fscore", np.nan)) and not np.isfinite(i.get("roa", np.nan)) and not np.isfinite(i.get("zscore", np.nan)):
        return {"available": False}
    return clean({
        "available": True,
        "metrics": {k: i.get(k) for k in FUND_METRICS} | {"adr": adr},
        "scores": {k: s.get(k) for k in ("fund", "f_quality", "f_safety", "f_value")},
        "rules": cfg.momentum["fundamentals"]["rules"],
    })


def shard_of(ticker: str) -> str:
    c = ticker[:1].upper()
    return c if "A" <= c <= "Z" else "_"


def build_artifacts(ctx: Context, t: int, res: dict[str, ClassResult], hist: dict, meta_extra: dict,
                    prev_states: dict[str, str] | None = None, profiles: pd.DataFrame | None = None) -> dict[str, Any]:
    cfg = ctx.cfg
    P = ctx.P
    asof = P.dates[t].date()
    bench = cfg.primary_benchmark
    bcol = {b: P.col(b) for b in cfg.benchmark_tickers if P.has(b)}
    ref_ind = ctx.indicators(t)
    w = cfg.windows

    def bench_returns(b: str) -> dict[str, float | None]:
        if b not in ref_ind.index:
            # benchmarks are ETFs and are part of the candidate set; fall back to direct calc
            from .indicators import ret
            col = P.close_ff[:, bcol[b]][:, None]
            return {h: clean(float(ret(col, t, n)[0])) for h, n in (("r1m", w["m1"]), ("r3m", w["m3"]), ("r6m", w["m6"]), ("r12m", w["m12"]))} | {"d1": clean(float(ret(col, t, 1)[0]))}
        r = ref_ind.loc[b]
        return {"d1": clean(r["chg_1d"]), "r1m": clean(r["r1m"]), "r3m": clean(r["r3m"]), "r6m": clean(r["r6m"]),
                "r12m": clean(r["r12m"]), "ytd": clean(r["ytd"])}

    bench_ret = {b: bench_returns(b) for b in bcol}
    sector_etf = cfg.sector_etfs

    rows: list[dict] = []
    details: dict[str, dict] = {}
    excluded: list[dict] = []
    reports_top: dict[str, list[dict]] = {}
    coverage: dict[str, dict] = {}

    # Ranking history lookup
    def hist_for(c: str, tk: str) -> dict:
        ranks, ovs = hist[c]
        if tk not in ranks.columns:
            return {"d": [], "r": [], "o": []}
        s, o = ranks[tk], ovs[tk]
        return {"d": [d.date().isoformat() for d in ranks.index], "r": clean(s.tolist()), "o": clean(o.round(1).tolist())}

    def rank_change(c: str, tk: str, n: int = 21) -> float | None:
        ranks, _ = hist[c]
        if tk not in ranks.columns or len(ranks) == 0:
            return None
        target = P.dates[t - n] if t - n >= 0 else None
        if target is None or target not in ranks.index:
            return None
        before, now = ranks.at[target, tk], ranks[tk].iloc[-1]
        if not (np.isfinite(before) and np.isfinite(now)):
            return None
        return float(before - now)  # positive = improved (moved up)

    sector_ret: dict[str, dict] = {}
    for sname, etf in sector_etf.items():
        if etf in ref_ind.index:
            r = ref_ind.loc[etf]
            sector_ret[sname] = {"etf": etf, "r1m": r["r1m"], "r3m": r["r3m"], "r6m": r["r6m"], "r12m": r["r12m"],
                                 "rs_slope_21": r["rs_slope_21"], "mom": r["mom_12_1_riskadj"]}
    sec_df = pd.DataFrame(sector_ret).T
    if len(sec_df):
        sec_df["strength"] = pct_rank(sec_df["mom"].astype(float)) * 0.5 + pct_rank(sec_df["r3m"].astype(float)) * 0.5

    for c in CLASSES:
        r = res[c]
        sc, ind, el = r.scores, r.ind, r.elig
        universe_label = "stocks" if c == "stock" else "ETFs"
        hp = {h: pct_rank(ind.loc[sc.index, h]) for h in ("r1m", "r3m", "r6m", "r12m")}
        reasons_count: dict[str, int] = {}
        for tk, e in el.iterrows():
            if not e["eligible"]:
                for rr in e["reasons"]:
                    reasons_count[rr] = reasons_count.get(rr, 0) + 1
                excluded.append({"t": tk, "n": str(ctx.ref["name"].get(tk, tk)), "cls": c,
                                 "reasons": [REASONS[x] for x in e["reasons"]],
                                 "codes": list(e["reasons"]), "px": clean(ind.at[tk, "price"]),
                                 "adv": clean(ind.at[tk, "adv_63"])})
        coverage[c] = {"candidates": int(len(el)), "eligible": int(el["eligible"].sum()) if len(el) else 0,
                       "excluded_by_reason": {REASONS[k]: v for k, v in sorted(reasons_count.items(), key=lambda x: -x[1])}}

        for tk in sc.index:
            i, s = ind.loc[tk], sc.loc[tk]
            st = r.states[tk]
            act = r.actions[tk]
            sector = ctx.sector.get(tk) if c == "stock" else None
            sector = sector if isinstance(sector, str) else None
            shares = ctx.shares.get(tk, np.nan)
            mcap = shares * i["price"] if np.isfinite(shares) else np.nan
            flags = []
            if ctx.ref["type"].get(tk) == "ADRC":
                flags.append("ADR")
            if c == "stock" and not np.isfinite(mcap):
                flags.append("mcap_nd")
            if i["extreme_moves"] > 0:
                flags.append("extreme_move")
            sec_rel = None
            if sector and sector in sector_ret:
                sr = sector_ret[sector]["r6m"]
                if np.isfinite(i["r6m"]) and np.isfinite(sr):
                    sec_rel = (1 + i["r6m"]) / (1 + sr) - 1
            row = {
                "t": tk, "n": str(ctx.ref["name"].get(tk, tk)), "cls": c,
                "ex": ctx.ref["exchange"].get(tk), "sec": sector, "mcap": clean(mcap),
                **{short: clean(i[k]) for k, short in ROW_FIELDS.items()},
                "m": clean(round(s["momentum"], 1)), "tq": clean(round(s["trend_quality"], 1)),
                "a": clean(round(s["acceleration"], 1)), "rk": clean(round(s["risk"], 1)),
                "ov": clean(round(s["overall"], 1)), "rank": int(s["rank"]),
                "dr": clean(rank_change(c, tk)), "dm": clean(s["mom_pct_change"]),
                "lead": clean(i["residual_mom"]), "secrel": clean(sec_rel),
                "st": st["state"], "pst": (prev_states or {}).get(tk), "tags": st["tags"],
                "why": short_reasons(i, s), "flags": flags,
                "bo": bool(i["breakout"]), "h52": bool(i["new_52w_high"]),
                "act": act["action"], "hold": act["hold"],
                "pe": clean(i.get("pe")) if c == "stock" else None,
                "prof": None if c != "stock" or not np.isfinite(i.get("profitable", np.nan)) else bool(i["profitable"]),
                "fund": clean(round(s["fund"], 1)) if c == "stock" and np.isfinite(s.get("fund", np.nan)) else None,
                "fs": clean(i.get("fscore")) if c == "stock" else None,
                "flags_f": len(act.get("red_flags", [])) * 10 + len(act.get("yellow_flags", [])),
            }
            rows.append(row)
            quality = {
                "source": meta_extra["provider"], "asof": asof.isoformat(),
                "history_sessions": int(i["history_sessions"]), "missing_frac": clean(i["missing_frac"]),
                "total_return": meta_extra["total_return"],
                "notes": ([] if meta_extra["total_return"] else ["Prices adjusted for splits only (dividends not included)."])
                + (["Company size estimated as shares outstanding (SEC) x price."] if c == "stock" and np.isfinite(mcap) else [])
                + (["Company size not available."] if c == "stock" and not np.isfinite(mcap) else [])
                + (["Sector approximated from the SEC industry code (not GICS)."] if sector else [])
                + (["A daily move above 50% in the last year (checked: not a data error)."] if i["extreme_moves"] > 0 else []),
            }
            rep = report(tk, row["n"], c, i, s, st, act, bench, bench_ret.get(bench, {}),
                         {h: hp[h].get(tk) for h in hp}, universe_label, quality)
            comps = {}
            for score, cw in cfg.momentum["scores"].items():
                comps[score] = [{"key": k, "label": LABELS.get(k, k), "weight": wt,
                                 "raw": clean(s["mom_pct_change"] if k == "mom_pct_change" else i.get(k)),
                                 "pct": clean(s.get(f"pct_{k}" if k != "mom_pct_change" else "pct_mom_pct_change_pct"))}
                                for k, wt in cw.items()]
            details[tk] = {
                "row": row, "indicators": clean({k: i.get(k) for k in DETAIL_INDICATORS}),
                "components": comps, "state": clean(st), "action": clean(act), "report": rep, "hist": hist_for(c, tk),
                "fundamentals": fundamentals_block(i, s, cfg, adr=ctx.ref["type"].get(tk) == "ADRC") if c == "stock" else None,
                "eligible": True,
            }
        top_n = cfg.momentum["reports"]["top_stocks" if c == "stock" else "top_etfs"]
        reports_top[c] = [details[tk]["report"] | {"rank": int(sc.at[tk, "rank"])}
                          for tk in sc.sort_values("rank").index[:top_n]]

        # Details for excluded candidates with enough data to chart (e.g. portfolio holdings).
        for tk, e in el.iterrows():
            if e["eligible"] or tk in details:
                continue
            i = ind.loc[tk]
            details[tk] = {"row": {"t": tk, "n": str(ctx.ref["name"].get(tk, tk)), "cls": c,
                                   **{short: clean(i[k]) for k, short in ROW_FIELDS.items()}},
                           "indicators": clean({k: i.get(k) for k in DETAIL_INDICATORS}), "eligible": False,
                           "excluded": [REASONS[x] for x in e["reasons"]]}

    # Price series (last ~2y) for every asset with details + benchmarks/sector ETFs.
    n_ser = min(504, t + 1)
    sessions = [d.date().isoformat() for d in P.dates[t - n_ser + 1 : t + 1]]
    for tk in list(details) + [b for b in set(bcol) | set(sector_etf.values()) if P.has(b) and b not in details]:
        col = P.col(tk)
        cser = P.close[t - n_ser + 1 : t + 1, col]
        vser = P.volume[t - n_ser + 1 : t + 1, col]
        d = details.setdefault(tk, {"row": {"t": tk, "n": str(ctx.ref["name"].get(tk, tk)), "cls": "etf"}, "eligible": False})
        d["series"] = {"c": clean(cser.tolist(), 6), "v": [None if not np.isfinite(x) else int(x) for x in vser]}
        # Adjustment events inside the window: raw(t) = adj(t) / prod(factors with ex_date > t)
        d["events"] = [list(e) for e in P.events.get(tk, []) if e[0] >= sessions[0]]

    if profiles is not None and not profiles.empty:
        for r in profiles.drop_duplicates("ticker", keep="last").itertuples(index=False):
            if r.ticker in details and isinstance(r.description, str) and r.description.strip():
                details[r.ticker]["profile"] = clean({"description": r.description.strip(), "homepage": r.homepage,
                                                      "employees": r.employees, "list_date": r.list_date,
                                                      "industry": r.industry, "fetched_at": r.fetched_at})

    shards: dict[str, dict] = {}
    for tk, d in details.items():
        shards.setdefault(shard_of(tk), {})[tk] = d

    # Market overview
    st_rows = [r for r in rows if r["cls"] == "stock"]
    s_ind = res["stock"].ind.loc[[r["t"] for r in st_rows]] if st_rows else pd.DataFrame()
    breadth = {}
    if len(s_ind):
        breadth = {"above_sma50": clean((s_ind["px_vs_sma50"] > 0).mean()),
                   "above_sma200": clean((s_ind["px_vs_sma200"] > 0).mean()),
                   "new_52w_high": clean(s_ind["new_52w_high"].mean()),
                   "median_r3m": clean(s_ind["r3m"].median()), "n": len(s_ind)}
    states_count = {c: {} for c in CLASSES}
    for r in rows:
        states_count[r["cls"]][r["st"]] = states_count[r["cls"]].get(r["st"], 0) + 1
    top50 = sorted(st_rows, key=lambda r: r["rank"])[:50]
    sectors_out = []
    for sname, sr in sector_ret.items():
        sectors_out.append({"sector": sname, "etf": sr["etf"], "r1m": clean(sr["r1m"]), "r3m": clean(sr["r3m"]),
                            "r6m": clean(sr["r6m"]), "r12m": clean(sr["r12m"]),
                            "rs_slope_21": clean(sr["rs_slope_21"]),
                            "strength": clean(sec_df.at[sname, "strength"]) if len(sec_df) else None,
                            "in_top50": sum(1 for r in top50 if r["sec"] == sname),
                            "eligible": sum(1 for r in st_rows if r["sec"] == sname)})
    sectors_out.sort(key=lambda x: -(x["strength"] or 0))
    bench_state = {}
    for b in bcol:
        if b in ref_ind.index:
            r = ref_ind.loc[b]
            bench_state[b] = {"price": clean(r["price"]), "px_vs_sma50": clean(r["px_vs_sma50"]),
                              "px_vs_sma200": clean(r["px_vs_sma200"]), "vol_63": clean(r["vol_63"]),
                              "dd_now": clean(r["dd_now"]), **bench_ret[b]}

    from .proxies import proxy_stats
    market = {"asof": asof.isoformat(), "breadth": breadth, "states": states_count, "sectors": sectors_out,
              "benchmarks": bench_state, "primary": bench,
              "proxies": proxy_stats(P, t, bench, cfg.proxies)}

    s_sc = res["stock"].scores
    sens = sensitivity(s_sc, cfg.momentum["overall"], cfg.momentum["sensitivity"]) if len(s_sc) >= 50 else None
    comp_keys = sorted({k for comps in cfg.momentum["scores"].values() for k in comps} - {"mom_pct_change"}) + ["atr_pct", "residual_mom"]
    corr = component_correlation(res["stock"].ind.loc[s_sc.index], comp_keys) if len(s_sc) >= 50 else None

    radar = {"asof": asof.isoformat(), "bench": bench_ret, "sessions_ref": sessions[-1], "rows": rows}
    meta = {
        "schema": SCHEMA_VERSION, "data_asof": asof.isoformat(),
        "coverage": coverage, "benchmarks": cfg.benchmarks["options"], "primary_benchmark": bench,
        "sector_etfs": sector_etf, "states": STATES, "actions": ACTIONS, "sessions": sessions,
        "methodology": {"version": cfg.momentum["methodology_version"], "config_hash": cfg.hash,
                        "scores": cfg.momentum["scores"], "overall": cfg.momentum["overall"],
                        "classification": cfg.momentum["classification"], "action": cfg.momentum["action"],
                        "fundamentals": cfg.momentum["fundamentals"],
                        "windows": cfg.windows,
                        "labels": LABELS, "universe": cfg.universe["coverage_statement"].strip(),
                        "universe_rules": {k: cfg.universe[k] for k in ("stocks", "etfs")}},
        "sensitivity": sens, "correlation": corr,
        "reports": reports_top,
        **meta_extra,
    }
    return {"meta": meta, "radar": radar, "excluded": excluded, "market": market, "shards": shards}


def publish(storage: Storage, art: dict, run_id: str, prefix: str = "published") -> None:
    base = f"{prefix}/runs/{run_id}"
    for sh, data in art["shards"].items():
        write_json(storage, f"{base}/assets/{sh}.json.gz", clean(data))
    write_json(storage, f"{base}/radar.json.gz", clean(art["radar"]))
    write_json(storage, f"{base}/excluded.json.gz", clean(art["excluded"]))
    write_json(storage, f"{base}/market.json", clean(art["market"]))
    write_json(storage, f"{base}/meta.json", clean(art["meta"]))
    # The pointer is written last: readers never see a half-written run.
    m = art["meta"]
    write_json(storage, f"{prefix}/latest.json", clean({
        "schema": SCHEMA_VERSION, "run_id": run_id, "data_asof": m["data_asof"],
        "session_close_utc": m.get("session_close_utc"), "computed_at": m["computed_at"],
        "demo": m["demo"], "status": m["status"], "provider": m["provider"], "path": f"runs/{run_id}",
    }))
    _retention(storage, prefix, keep=KEEP_RUNS)


def _retention(storage: Storage, prefix: str, keep: int) -> None:
    files = storage.list(f"{prefix}/runs")
    runs = sorted({f.split("/")[2] for f in files if f.count("/") >= 3})
    old = runs[:-keep]
    if old:
        storage.delete([f for f in files if f.split("/")[2] in old])
        log.info("retention: removed %d old runs", len(old))


def new_run_id(asof: date, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return f"{asof:%Y%m%d}-{now:%H%M%S}"


def previous_states(storage: Storage, prefix: str = "published") -> tuple[dict[str, str], str | None]:
    """Ticker -> state of the latest published run (to show state changes)."""
    latest = read_json(storage, f"{prefix}/latest.json")
    if not latest:
        return {}, None
    radar = read_json(storage, f"{prefix}/{latest['path']}/radar.json.gz") or {"rows": []}
    return {r["t"]: r["st"] for r in radar["rows"]}, latest.get("data_asof")


def previous_actions(storage: Storage, prefix: str = "published") -> dict[str, list]:
    """Ticker -> [action, hold, name] of the latest published run (signal-change notifications)."""
    from .signals import snapshot

    latest = read_json(storage, f"{prefix}/latest.json")
    if not latest:
        return {}
    radar = read_json(storage, f"{prefix}/{latest['path']}/radar.json.gz") or {"rows": []}
    return snapshot(radar["rows"])


def previous_meta(storage: Storage, prefix: str = "published") -> dict | None:
    latest = read_json(storage, f"{prefix}/latest.json")
    if not latest:
        return None
    return read_json(storage, f"{prefix}/{latest['path']}/meta.json")
