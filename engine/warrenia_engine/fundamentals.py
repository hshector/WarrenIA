"""Fundamental analysis from SEC XBRL facts (annual, as reported).

Only measures with strong academic support are scored:

  Piotroski F-Score (Piotroski 2000)        9 binary signals of improving financial strength
  Altman Z'' (Altman 1968; Z'' 1995)        bankruptcy-risk score for non-financial companies
  Gross profitability (Novy-Marx 2013)      gross profit / total assets
  Accruals (Sloan 1996)                     (net income - operating cash flow) / assets: low is better
  Earnings yield EBIT/EV (Greenblatt 2006;  best single valuation ratio in Gray & Carlisle,
    Gray & Carlisle 2012)                   "Quantitative Value"
  Net share issuance (Pontiff & Woodgate    dilution predicts lower returns
    2008; Daniel & Titman 2006)
  Quality minus junk (Asness, Frazzini &    quality = profitable, safe, well managed; the
    Pedersen 2019)                          composite below follows that structure

Data: SEC "frames" API, one call per concept and period for every filer. Flows come
from annual duration frames (CY####), balance sheet items from quarterly instant frames
(CY####Q#I) matched to each company's fiscal year end, so non-December fiscal years work.

Foreign filers reporting under IFRS (most European ADRs: SAP, Novo Nordisk, AstraZeneca...)
are not in the US GAAP frames: their facts come from each company's "companyfacts" file
(ifrs-full taxonomy, annual 20-F/40-F reports), in the reporting currency. Ratios are
currency-free; amounts are converted to USD with ECB reference rates for valuation.

Limitations (documented in the UI): companies without XBRL data at the SEC are "not
available", never "bad"; banks and insurers have no gross profit / current assets, so the
F-Score and Z'' are not computed for them (SIC 6000-6799); for ADRs the price is per ADR
and the ADR-to-share ratio is not in the data, so price-based ratios are not shown.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

# concept -> (period kind, us-gaap tags in priority order, unit)
CONCEPTS: dict[str, tuple[str, list[str], str]] = {
    "revenue": ("dur", ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"], "USD"),
    "cogs": ("dur", ["CostOfRevenue", "CostOfGoodsAndServicesSold"], "USD"),
    "gross_profit": ("dur", ["GrossProfit"], "USD"),
    "operating_income": ("dur", ["OperatingIncomeLoss"], "USD"),
    "net_income": ("dur", ["NetIncomeLoss", "ProfitLoss"], "USD"),
    "cfo": ("dur", ["NetCashProvidedByUsedInOperatingActivities"], "USD"),
    "capex": ("dur", ["PaymentsToAcquirePropertyPlantAndEquipment"], "USD"),
    "interest": ("dur", ["InterestExpense"], "USD"),
    "dividends": ("dur", ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"], "USD"),
    "buybacks": ("dur", ["PaymentsForRepurchaseOfCommonStock"], "USD"),
    "diluted_shares": ("dur", ["WeightedAverageNumberOfDilutedSharesOutstanding"], "shares"),
    "assets": ("inst", ["Assets"], "USD"),
    "assets_current": ("inst", ["AssetsCurrent"], "USD"),
    "liabilities_current": ("inst", ["LiabilitiesCurrent"], "USD"),
    "liabilities": ("inst", ["Liabilities"], "USD"),
    "equity": ("inst", ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], "USD"),
    "cash": ("inst", ["CashAndCashEquivalentsAtCarryingValue"], "USD"),
    "retained_earnings": ("inst", ["RetainedEarningsAccumulatedDeficit"], "USD"),
    "lt_debt_noncurrent": ("inst", ["LongTermDebtNoncurrent"], "USD"),
    "lt_debt_total": ("inst", ["LongTermDebt"], "USD"),
    "lt_debt_current": ("inst", ["LongTermDebtCurrent"], "USD"),
    "short_borrowings": ("inst", ["ShortTermBorrowings"], "USD"),
}

# Same concepts in the IFRS taxonomy (ifrs-full), priority order. Borrowings are split so that
# current and non-current debt are never counted twice.
IFRS_TAGS: dict[str, list[str]] = {
    "revenue": ["Revenue", "RevenueFromContractsWithCustomers"],
    "cogs": ["CostOfSales"],
    "gross_profit": ["GrossProfit"],
    "operating_income": ["ProfitLossFromOperatingActivities"],
    "net_income": ["ProfitLossAttributableToOwnersOfParent", "ProfitLoss"],
    "cfo": ["CashFlowsFromUsedInOperatingActivities"],
    "capex": ["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", "PurchaseOfPropertyPlantAndEquipment"],
    "interest": ["InterestExpense", "FinanceCosts"],
    "dividends": ["DividendsPaidClassifiedAsFinancingActivities", "DividendsPaid"],
    "buybacks": ["PaymentsToAcquireOrRedeemEntitysShares"],
    "diluted_shares": ["AdjustedWeightedAverageShares"],
    "assets": ["Assets"],
    "assets_current": ["CurrentAssets"],
    "liabilities_current": ["CurrentLiabilities"],
    "liabilities": ["Liabilities"],
    "equity": ["EquityAttributableToOwnersOfParent", "Equity"],
    "cash": ["CashAndCashEquivalents"],
    "retained_earnings": ["RetainedEarnings"],
    "lt_debt_noncurrent": ["NoncurrentPortionOfNoncurrentBorrowings", "LongtermBorrowings"],
    "lt_debt_current": ["CurrentPortionOfLongtermBorrowings"],
    "short_borrowings": ["ShorttermBorrowings"],
}

FACT_COLUMNS = ["cik", "concept", "tag", "kind", "start", "end", "val", "unit"]
ANNUAL_FORMS = {"10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A", "10-KT"}


def parse_companyfacts(js: dict, cik: int) -> list[tuple]:
    """Annual facts of one company from SEC companyfacts JSON (ifrs-full, or us-gaap in USD).

    Flows: fiscal-year durations (330-400 days) from annual reports. Balances: any reported
    year-end. When a value was restated, the latest filing wins.
    """
    facts = js.get("facts", {}) if isinstance(js, dict) else {}
    out: dict[tuple, tuple] = {}
    for taxonomy, mapping in (("ifrs-full", IFRS_TAGS), ("us-gaap", {c: v[1] for c, v in CONCEPTS.items()})):
        tax = facts.get(taxonomy) or {}
        for concept, tags in mapping.items():
            kind = CONCEPTS[concept][0]
            for tag in tags:
                units = (tax.get(tag) or {}).get("units") or {}
                for unit, items in units.items():
                    if concept == "diluted_shares":
                        if unit != "shares":
                            continue
                    elif taxonomy == "us-gaap" and unit != "USD":
                        continue
                    elif not (len(unit) == 3 and unit.isalpha() and unit.isupper()):
                        continue  # monetary facts only (EUR, USD, DKK…), not per-share units
                    for it in items:
                        if it.get("form") not in ANNUAL_FORMS or it.get("val") is None:
                            continue
                        end, start = it.get("end"), it.get("start")
                        if kind == "dur":
                            if not start:
                                continue
                            days = (pd.Timestamp(end) - pd.Timestamp(start)).days
                            if not 330 <= days <= 400:
                                continue
                        key = (concept, taxonomy, tag, end)
                        filed = it.get("filed") or ""
                        if key not in out or filed >= out[key][0]:
                            name = f"ifrs-full:{tag}" if taxonomy == "ifrs-full" else tag
                            out[key] = (filed, (cik, concept, name, kind, start if kind == "dur" else None, end,
                                                float(it["val"]), unit))
    return [v[1] for v in out.values()]


def frame_names(today: date, years: int = 4) -> dict[str, list[str]]:
    """Annual duration frames (newest first) and quarterly instant frames for the same years."""
    yrs = [today.year - k for k in range(years)]
    return {"dur": [f"CY{y}" for y in yrs], "inst": [f"CY{y}Q{q}I" for y in yrs for q in (4, 3, 2, 1)]}


def merge_tags(facts: pd.DataFrame) -> pd.DataFrame:
    """One value per (cik, concept, end): the highest-priority tag that reported it."""
    if facts.empty:
        return facts
    prio = {(c, t): i for c, (_, tags, _) in CONCEPTS.items() for i, t in enumerate(tags)}
    prio |= {(c, f"ifrs-full:{t}"): 50 + i for c, tags in IFRS_TAGS.items() for i, t in enumerate(tags)}
    f = facts.copy()
    f["_p"] = [prio.get((c, t), 99) for c, t in zip(f["concept"], f["tag"])]
    f = f.sort_values(["cik", "concept", "end", "_p"]).drop_duplicates(["cik", "concept", "end"], keep="first")
    return f.drop(columns="_p")


def _near(values: dict[pd.Timestamp, float], when: pd.Timestamp | None, tol_days: int) -> float:
    if when is None or not values:
        return np.nan
    best, gap = np.nan, tol_days + 1
    for d, v in values.items():
        g = abs((d - when).days)
        if g < gap:
            best, gap = v, g
    return best if gap <= tol_days else np.nan


def _prev_year_end(ends: list[pd.Timestamp], fy0: pd.Timestamp) -> pd.Timestamp | None:
    cands = [e for e in ends if 330 <= (fy0 - e).days <= 400]
    return max(cands) if cands else None


def company_metrics(facts: pd.DataFrame, sic: int | None = None) -> dict:
    """All fundamental metrics of one company from its merged facts (one CIK)."""
    by: dict[str, dict[pd.Timestamp, float]] = {}
    for r in facts.itertuples(index=False):
        by.setdefault(r.concept, {})[pd.Timestamp(r.end)] = float(r.val)
    anchor = by.get("net_income") or by.get("revenue") or by.get("cfo")
    if not anchor:
        return {}
    fy0 = max(anchor)
    fy1 = _prev_year_end(list(anchor), fy0)
    fy2 = _prev_year_end(list(anchor), fy1) if fy1 is not None else None
    if fy1 is not None and fy2 is None:  # beginning-of-year assets for FY-1 may exist without FY-2 flows
        fy2 = fy1 - timedelta(days=365)

    def d(c: str, when):  # annual flow
        return _near(by.get(c, {}), when, 7)

    def i(c: str, when):  # balance-sheet item at a fiscal year end
        return _near(by.get(c, {}), when, 20)

    def debt(when):
        tot = i("lt_debt_total", when)
        if not np.isfinite(tot):
            nc, cur = i("lt_debt_noncurrent", when), i("lt_debt_current", when)
            tot = np.nansum([nc, cur]) if np.isfinite(nc) or np.isfinite(cur) else np.nan
        sb = i("short_borrowings", when)
        return tot + (sb if np.isfinite(sb) else 0.0) if np.isfinite(tot) else (sb if np.isfinite(sb) else np.nan)

    def ltd(when):  # Piotroski's leverage uses long-term debt
        v = i("lt_debt_noncurrent", when)
        return v if np.isfinite(v) else i("lt_debt_total", when)

    m: dict = {"fy_end": fy0.date().isoformat(), "fy_prev_end": fy1.date().isoformat() if fy1 is not None else None}
    rev0, rev1 = d("revenue", fy0), d("revenue", fy1)
    gp0, gp1 = d("gross_profit", fy0), d("gross_profit", fy1)
    if not np.isfinite(gp0) and np.isfinite(rev0):
        gp0 = rev0 - d("cogs", fy0)
    if not np.isfinite(gp1) and np.isfinite(rev1):
        gp1 = rev1 - d("cogs", fy1)
    ni0, ni1 = d("net_income", fy0), d("net_income", fy1)
    cfo0 = d("cfo", fy0)
    op0 = d("operating_income", fy0)
    capex0 = d("capex", fy0)
    a0, a1, a2 = i("assets", fy0), i("assets", fy1), i("assets", fy2)
    ca0, ca1 = i("assets_current", fy0), i("assets_current", fy1)
    cl0, cl1 = i("liabilities_current", fy0), i("liabilities_current", fy1)
    liab0, eq0, cash0, re0 = i("liabilities", fy0), i("equity", fy0), i("cash", fy0), i("retained_earnings", fy0)
    if not np.isfinite(liab0) and np.isfinite(a0) and np.isfinite(eq0):
        liab0 = a0 - eq0
    sh0, sh1 = d("diluted_shares", fy0), d("diluted_shares", fy1)
    div0, bb0 = d("dividends", fy0), d("buybacks", fy0)
    financial = sic is not None and 6000 <= int(sic) <= 6799

    with np.errstate(divide="ignore", invalid="ignore"):
        div = lambda x, y: float(x / y) if np.isfinite(x) and np.isfinite(y) and y != 0 else np.nan  # noqa: E731
        m.update({
            "revenue": rev0, "revenue_prev": rev1, "gross_profit": gp0, "operating_income": op0, "net_income": ni0,
            "net_income_prev": ni1, "cfo": cfo0, "capex": capex0,
            "fcf": cfo0 - (capex0 if np.isfinite(capex0) else 0.0) if np.isfinite(cfo0) else np.nan,
            "assets": a0, "equity": eq0, "cash": cash0, "debt": debt(fy0),
            "dividends_paid": div0, "buybacks": bb0, "financial": financial,
        })
        m["roa"] = div(ni0, a1)                       # Piotroski: beginning-of-year assets
        roa_prev = div(ni1, a2)
        m["cfo_assets"] = div(cfo0, a1)
        m["accruals"] = div(ni0 - cfo0, a1) if np.isfinite(ni0) and np.isfinite(cfo0) else np.nan
        m["gross_profitability"] = div(gp0, a0)       # Novy-Marx: gross profit / total assets
        m["gross_margin"] = div(gp0, rev0)
        gm1 = div(gp1, rev1)
        m["operating_margin"] = div(op0, rev0)
        m["roe"] = div(ni0, eq0) if np.isfinite(eq0) and eq0 > 0 else np.nan
        m["revenue_growth"] = div(rev0, rev1) - 1 if np.isfinite(div(rev0, rev1)) else np.nan
        m["share_change"] = div(sh0, sh1) - 1 if np.isfinite(div(sh0, sh1)) else np.nan
        m["debt_assets"] = div(m["debt"], a0)
        m["interest_coverage"] = div(op0, d("interest", fy0)) if np.isfinite(d("interest", fy0)) and d("interest", fy0) > 0 else np.nan
        lev0, lev1 = div(ltd(fy0) if np.isfinite(ltd(fy0)) else 0.0, a0), div(ltd(fy1) if np.isfinite(ltd(fy1)) else 0.0, a1)
        cr0, cr1 = div(ca0, cl0), div(ca1, cl1)
        turn0, turn1 = div(rev0, a1), div(rev1, a2)

    # --- Piotroski F-Score: only when all nine signals can be evaluated (never on partial data).
    signals = {
        "roa_positive": m["roa"] > 0 if np.isfinite(m["roa"]) else None,
        "cfo_positive": cfo0 > 0 if np.isfinite(cfo0) else None,
        "roa_improving": m["roa"] > roa_prev if np.isfinite(m["roa"]) and np.isfinite(roa_prev) else None,
        "cash_earnings": cfo0 > ni0 if np.isfinite(cfo0) and np.isfinite(ni0) else None,
        "leverage_not_up": lev0 <= lev1 + 1e-9 if np.isfinite(lev0) and np.isfinite(lev1) else None,
        "liquidity_up": cr0 > cr1 if np.isfinite(cr0) and np.isfinite(cr1) else None,
        # Piotroski's "no equity issued": diluted share count did not grow by more than 1% (option noise).
        "no_dilution": m["share_change"] <= 0.01 if np.isfinite(m["share_change"]) else None,
        "margin_up": m["gross_margin"] > gm1 if np.isfinite(m["gross_margin"]) and np.isfinite(gm1) else None,
        "turnover_up": turn0 > turn1 if np.isfinite(turn0) and np.isfinite(turn1) else None,
    }
    m["fscore_signals"] = {k: (None if v is None else bool(v)) for k, v in signals.items()}
    known = [v for v in signals.values() if v is not None]
    m["fscore"] = float(sum(known)) if len(known) == 9 and not financial else np.nan

    # --- Altman Z'' (non-manufacturers version; also valid for manufacturers): not for financials.
    if not financial and all(np.isfinite(x) for x in (ca0, cl0, a0, re0, op0, eq0, liab0)) and a0 > 0 and liab0 > 0:
        m["zscore"] = 6.56 * (ca0 - cl0) / a0 + 3.26 * re0 / a0 + 6.72 * op0 / a0 + 1.05 * eq0 / liab0
    else:
        m["zscore"] = np.nan
    return m


MONETARY = {c for c, (_, _, unit) in CONCEPTS.items() if unit == "USD"}


def to_usd(facts: pd.DataFrame, fx: dict[str, float] | None) -> pd.DataFrame:
    """Monetary facts in USD (ECB cross rates); a currency without a rate keeps its value and
    is marked so price-based ratios are not computed for that company."""
    f = facts.copy()
    if "unit" not in f:
        f["unit"] = "USD"  # facts stored before IFRS support: all US GAAP frames in USD
    f["unit"] = f["unit"].fillna("USD")
    cur = f["unit"].where(f["concept"].isin(MONETARY), "USD")
    rate = cur.map(lambda c: 1.0 if c == "USD" else (fx or {}).get(c, np.nan))
    f["fx_missing"] = rate.isna()
    f["val"] = np.where(rate.notna(), f["val"] * rate.fillna(1.0), f["val"])
    f["currency"] = cur
    return f


def compute_fundamentals(facts: pd.DataFrame, tickers: pd.DataFrame, fx: dict[str, float] | None = None) -> pd.DataFrame:
    """Per-ticker metrics. `tickers` has ticker, cik (10-digit string or int) and sic. `fx` gives USD
    per unit of each reporting currency (needed for IFRS filers reporting in EUR, DKK...)."""
    if facts is None or facts.empty or tickers is None or tickers.empty:
        return pd.DataFrame()
    f = merge_tags(to_usd(facts, fx))
    groups = {int(c): g for c, g in f.groupby("cik")}
    rows = []
    for r in tickers.dropna(subset=["cik"]).itertuples(index=False):
        try:
            cik = int(r.cik)
        except (TypeError, ValueError):
            continue
        g = groups.get(cik)
        if g is None:
            continue
        sic = getattr(r, "sic", None)
        m = company_metrics(g, int(sic) if sic is not None and pd.notna(sic) else None)
        if m:
            cur = g.loc[g["currency"] != "USD", "currency"]
            m["currency"] = cur.mode().iat[0] if len(cur) else "USD"
            m["standard"] = "IFRS" if g["tag"].str.startswith("ifrs-full:").mean() > 0.5 else "US GAAP"
            m["fx_missing"] = bool(g["fx_missing"].any())
            rows.append({"ticker": r.ticker, **m})
    return pd.DataFrame(rows).set_index("ticker") if rows else pd.DataFrame()


def add_valuation(fund: pd.DataFrame, mcap: pd.Series, no_price_ratios: pd.Index | None = None) -> pd.DataFrame:
    """Price-dependent ratios at the evaluation date (market cap = shares x price).

    `no_price_ratios`: tickers whose market cap is not comparable with their statements (ADRs:
    the price is per ADR; reports in a currency without an exchange rate). Ratios are left blank."""
    out = fund.copy()
    mc = mcap.reindex(out.index)
    bad = out.index.isin(no_price_ratios if no_price_ratios is not None else [])
    if "fx_missing" in out:
        bad |= out["fx_missing"].fillna(False).astype(bool).to_numpy()
    mc = mc.where(~bad)
    debt = out["debt"].fillna(0.0)  # no debt reported -> treated as debt-free (flagged in the UI)
    cash = out["cash"].fillna(0.0)
    ev = mc + debt - cash
    with np.errstate(divide="ignore", invalid="ignore"):
        out["ev"] = ev
        out["ebit_ev"] = (out["operating_income"] / ev).where(ev > 0)
        out["fcf_yield"] = out["fcf"] / mc
        out["earnings_yield"] = out["net_income"] / mc
        out["pe"] = (mc / out["net_income"]).where(out["net_income"] > 0)
        out["pb"] = (mc / out["equity"]).where(out["equity"] > 0)
        payout = out["dividends_paid"].fillna(0.0) + out["buybacks"].fillna(0.0)
        out["shareholder_yield"] = (payout / mc).where(out["dividends_paid"].notna() | out["buybacks"].notna())
        out["debt_reported"] = fund["debt"].notna()
    return out
