"""SEC EDGAR (official, free): SIC codes and shares outstanding.

- company_tickers_exchange.json maps tickers -> CIK.
- XBRL "frames" API returns dei:EntityCommonStockSharesOutstanding for every filer
  for a given quarter in one call (we use the latest available instant frames).
- submissions/CIK##########.json provides the SIC code (cached; rarely changes).

SEC fair-access policy: max 10 requests/second and a User-Agent that identifies
you with a contact e-mail (SEC_USER_AGENT="WarrenIA tu-email@dominio.com").
Limitations: companies with several share classes report one total; some foreign
filers (20-F/40-F) do not report this dei fact -> market cap unknown (flagged).
"""

from __future__ import annotations

import logging
import os
from datetime import date

import pandas as pd

from ..http import HttpClient, ProviderError
from .base import FUNDAMENTAL_COLUMNS, empty

log = logging.getLogger(__name__)


def _recent_frames(today: date, n: int = 4) -> list[str]:
    q = (today.month - 1) // 3 + 1
    y = today.year
    out = []
    for _ in range(n):
        out.append(f"CY{y}Q{q}I")
        q -= 1
        if q == 0:
            q, y = 4, y - 1
    return out


class SecFundamentals:
    name = "sec"

    def __init__(self, user_agent: str, http: HttpClient | None = None, today: date | None = None):
        if not user_agent or "@" not in user_agent:
            raise ProviderError("SEC_USER_AGENT debe incluir un nombre y un e-mail de contacto")
        self.http = http or HttpClient("sec", min_interval=0.15, max_retries=4,
                                       headers={"User-Agent": user_agent, "Accept-Encoding": "gzip, deflate"})
        self.today = today or date.today()

    @classmethod
    def from_env(cls) -> "SecFundamentals | None":
        ua = os.environ.get("SEC_USER_AGENT", "")
        if not ua:
            log.warning("SEC_USER_AGENT no configurado: sin capitalización ni sectores")
            return None
        return cls(ua)

    def fundamentals(self, tickers: pd.DataFrame, previous: pd.DataFrame | None = None) -> pd.DataFrame:
        mp = self.http.get_json("https://www.sec.gov/files/company_tickers_exchange.json")
        fields = mp["fields"]
        m = pd.DataFrame(mp["data"], columns=fields)
        m["ticker"] = m["ticker"].str.upper().str.replace("-", ".", regex=False)
        m["cik"] = m["cik"].astype(int)

        stocks = tickers[tickers["type"].isin(["CS", "ADRC"]) & tickers["active"].astype(bool)]
        want = m[m["ticker"].isin(set(stocks["ticker"]))]

        # Shares outstanding: newest value per CIK across recent frames.
        shares: dict[int, tuple[float, str]] = {}
        for frame in _recent_frames(self.today):
            try:
                data = self.http.get_json(
                    f"https://data.sec.gov/api/xbrl/frames/dei/EntityCommonStockSharesOutstanding/shares/{frame}.json")
            except ProviderError as e:
                if e.status == 404:  # frame not published yet
                    continue
                raise
            for row in data.get("data", []):
                cik, end, val = int(row["cik"]), row["end"], float(row["val"])
                if val > 0 and (cik not in shares or end > shares[cik][1]):
                    shares[cik] = (val, end)

        # SIC codes: reuse cached values, fetch only new CIKs.
        known: dict[int, tuple] = {}
        if previous is not None and not previous.empty and "sic" in previous:
            for r in previous.dropna(subset=["cik"]).itertuples():
                try:
                    known[int(r.cik)] = (r.sic, r.sic_description)
                except (TypeError, ValueError):
                    pass
        for cik in sorted(set(want["cik"]) - set(known)):
            try:
                sub = self.http.get_json(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
                known[cik] = (sub.get("sic") or None, sub.get("sicDescription"))
            except ProviderError as e:
                log.warning("sec: submissions CIK %s: %s", cik, e)
                known[cik] = (None, None)

        rows = []
        for r in want.itertuples():
            sh = shares.get(r.cik)
            sic, desc = known.get(r.cik, (None, None))
            rows.append({"ticker": r.ticker, "cik": f"{r.cik:010d}", "sic": int(sic) if sic else None,
                         "sic_description": desc, "shares": sh[0] if sh else None,
                         "shares_asof": sh[1] if sh else None, "source": "SEC EDGAR"})
        log.info("sec: %d tickers, %d with shares, %d with SIC", len(rows),
                 sum(1 for x in rows if x["shares"]), sum(1 for x in rows if x["sic"]))
        return pd.DataFrame(rows, columns=FUNDAMENTAL_COLUMNS) if rows else empty(FUNDAMENTAL_COLUMNS)
