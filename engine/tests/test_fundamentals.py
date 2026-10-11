"""Fundamental metrics against hand calculations (Piotroski 2000, Altman Z'', Novy-Marx, Sloan)."""

import numpy as np
import pandas as pd
import pytest

from warrenia_engine.fundamentals import add_valuation, company_metrics, compute_fundamentals, merge_tags
from warrenia_engine.scoring import fundamental_scores


def facts_for(cik, fy_ends, flows, balances, extra=()):
    """flows: {concept: [FY0, FY-1]}; balances: {concept: [FY0, FY-1, FY-2]} at the given fiscal year ends."""
    tags = {"revenue": "Revenues", "gross_profit": "GrossProfit", "operating_income": "OperatingIncomeLoss",
            "net_income": "NetIncomeLoss", "cfo": "NetCashProvidedByUsedInOperatingActivities",
            "capex": "PaymentsToAcquirePropertyPlantAndEquipment",
            "diluted_shares": "WeightedAverageNumberOfDilutedSharesOutstanding", "interest": "InterestExpense",
            "assets": "Assets", "assets_current": "AssetsCurrent", "liabilities_current": "LiabilitiesCurrent",
            "liabilities": "Liabilities", "equity": "StockholdersEquity", "cash": "CashAndCashEquivalentsAtCarryingValue",
            "retained_earnings": "RetainedEarningsAccumulatedDeficit", "lt_debt_noncurrent": "LongTermDebtNoncurrent"}
    rows = []
    for c, vals in flows.items():
        for k, v in enumerate(vals):
            rows.append((cik, c, tags[c], "dur", None, fy_ends[k], float(v)))
    for c, vals in balances.items():
        for k, v in enumerate(vals):
            rows.append((cik, c, tags[c], "inst", None, fy_ends[k], float(v)))
    rows += list(extra)
    return pd.DataFrame(rows, columns=["cik", "concept", "tag", "kind", "start", "end", "val"])


# A healthy company with a June fiscal year end (non-calendar on purpose).
ENDS = ["2026-06-30", "2025-06-30", "2024-06-30"]
FLOWS = {"revenue": [1200, 1000], "gross_profit": [600, 450], "operating_income": [240, 180],
         "net_income": [150, 100], "cfo": [200, 120], "capex": [50, 40], "diluted_shares": [99, 100],
         "interest": [20, 20]}
BAL = {"assets": [1100, 1000, 950], "assets_current": [500, 400, 380], "liabilities_current": [250, 250, 240],
       "liabilities": [500, 520, 500], "equity": [600, 480, 450], "cash": [150, 120, 100],
       "retained_earnings": [300, 200, 150], "lt_debt_noncurrent": [180, 200, 210]}


def test_metrics_match_hand_calculation():
    m = company_metrics(merge_tags(facts_for(1, ENDS, FLOWS, BAL)), sic=7372)
    assert m["fy_end"] == "2026-06-30" and m["fy_prev_end"] == "2025-06-30"
    assert m["roa"] == pytest.approx(150 / 1000)                 # beginning-of-year assets
    assert m["cfo_assets"] == pytest.approx(200 / 1000)
    assert m["accruals"] == pytest.approx((150 - 200) / 1000)
    assert m["gross_profitability"] == pytest.approx(600 / 1100)  # Novy-Marx: current total assets
    assert m["revenue_growth"] == pytest.approx(0.2)
    assert m["share_change"] == pytest.approx(-0.01)
    assert m["fcf"] == pytest.approx(150)
    assert m["interest_coverage"] == pytest.approx(12)
    z = 6.56 * (500 - 250) / 1100 + 3.26 * 300 / 1100 + 6.72 * 240 / 1100 + 1.05 * 600 / 500
    assert m["zscore"] == pytest.approx(z)


def test_piotroski_all_nine_signals():
    m = company_metrics(merge_tags(facts_for(1, ENDS, FLOWS, BAL)), sic=7372)
    s = m["fscore_signals"]
    # ROA 15% > 0; CFO > 0; ROA up (15% vs 100/950); CFO > NI; LTD/A 0.164 < 0.2; current ratio 2.0 > 1.6;
    # shares down; gross margin 50% > 45%; asset turnover 1.2 > 1000/950.
    assert all(s.values()) and m["fscore"] == 9


def test_fscore_needs_all_signals_and_is_not_computed_for_banks():
    flows = {k: v for k, v in FLOWS.items() if k != "diluted_shares"}
    assert np.isnan(company_metrics(merge_tags(facts_for(1, ENDS, flows, BAL)))["fscore"])
    bank = company_metrics(merge_tags(facts_for(1, ENDS, FLOWS, BAL)), sic=6022)
    assert np.isnan(bank["fscore"]) and np.isnan(bank["zscore"]) and bank["financial"]


def test_deteriorating_company_scores_low():
    flows = {**FLOWS, "net_income": [-50, 100], "cfo": [-80, 120], "gross_profit": [400, 450],
             "diluted_shares": [120, 100], "revenue": [900, 1000]}
    bal = {**BAL, "lt_debt_noncurrent": [400, 200, 210], "assets_current": [300, 400, 380],
           "liabilities_current": [350, 250, 240]}
    m = company_metrics(merge_tags(facts_for(1, ENDS, flows, bal)), sic=7372)
    assert m["fscore"] <= 1
    assert m["share_change"] == pytest.approx(0.2)


def test_tag_priority_net_income_over_profit_loss():
    extra = [(1, "net_income", "ProfitLoss", "dur", None, ENDS[0], 999.0)]
    m = company_metrics(merge_tags(facts_for(1, ENDS, FLOWS, BAL, extra)), sic=7372)
    assert m["net_income"] == 150


def test_valuation_and_mapping_by_cik():
    facts = facts_for(1, ENDS, FLOWS, BAL)
    tickers = pd.DataFrame([{"ticker": "AAA", "cik": "0000000001", "sic": 7372}, {"ticker": "BBB", "cik": "0000000002", "sic": 7372}])
    f = compute_fundamentals(facts, tickers)
    assert list(f.index) == ["AAA"]
    v = add_valuation(f, pd.Series({"AAA": 2000.0}))
    ev = 2000 + 180 - 150  # debt = LTD noncurrent (no total reported), minus cash
    assert v.at["AAA", "ev"] == pytest.approx(ev)
    assert v.at["AAA", "ebit_ev"] == pytest.approx(240 / ev)
    assert v.at["AAA", "fcf_yield"] == pytest.approx(150 / 2000)
    assert v.at["AAA", "pe"] == pytest.approx(2000 / 150)


def test_fundamental_scores_rank_quality_and_value(cfg):
    df = pd.DataFrame({
        "gross_profitability": [0.6, 0.2, np.nan], "roa": [0.15, 0.01, np.nan], "cfo_assets": [0.2, 0.0, np.nan],
        "accruals": [-0.05, 0.12, np.nan], "fscore": [8, 3, np.nan], "zscore": [5, 1.0, np.nan],
        "debt_assets": [0.1, 0.6, np.nan], "interest_coverage": [20, 1.5, np.nan],
        "ebit_ev": [0.08, 0.01, np.nan], "fcf_yield": [0.06, -0.02, np.nan], "earnings_yield": [0.05, 0.0, np.nan],
    }, index=["GOOD", "JUNK", "UNKNOWN"])
    sc = fundamental_scores(df, cfg.momentum)
    assert sc.at["GOOD", "fund"] > sc.at["JUNK", "fund"]
    assert sc.at["GOOD", "f_quality"] > sc.at["JUNK", "f_quality"]
    assert np.isnan(sc.at["UNKNOWN", "fund"])  # unknown is never scored as bad
