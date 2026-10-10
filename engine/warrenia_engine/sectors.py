"""SEC SIC code -> broad sector buckets.

This is an APPROXIMATION aligned with the SPDR sector ETFs used as sector
benchmarks. It is not GICS (GICS is proprietary). Ranges follow the SIC division
structure with a few well-known overrides (software -> Technology, telecom/media ->
Communication, REITs -> Real Estate, pharma/biotech/medical devices -> Health Care).
"""

from __future__ import annotations

# Ordered: first match wins. (lo, hi inclusive, sector)
SIC_RULES: list[tuple[int, int, str]] = [
    (2830, 2836, "Health Care"),      # drugs, biologics
    (3841, 3851, "Health Care"),      # medical instruments
    (5047, 5047, "Health Care"),
    (5122, 5122, "Health Care"),
    (8000, 8099, "Health Care"),      # health services
    (8731, 8731, "Health Care"),      # commercial physical & biological research
    (3570, 3579, "Technology"),       # computers
    (3600, 3699, "Technology"),       # electronic equipment & semis (3674)
    (3810, 3829, "Technology"),       # instruments
    (7370, 7379, "Technology"),       # software & services
    (4800, 4899, "Communication"),    # telecom, broadcasting
    (2710, 2799, "Communication"),    # publishing
    (7810, 7819, "Communication"),    # motion pictures
    (7812, 7812, "Communication"),
    (6798, 6798, "Real Estate"),      # REITs
    (6500, 6599, "Real Estate"),
    (1300, 1399, "Energy"),           # oil & gas extraction
    (2900, 2999, "Energy"),           # petroleum refining
    (4610, 4619, "Energy"),           # pipelines
    (4900, 4999, "Utilities"),
    (6000, 6799, "Financials"),
    (1000, 1099, "Materials"),        # metal mining
    (1400, 1499, "Materials"),
    (2600, 2699, "Materials"),        # paper
    (2840, 2844, "Consumer Staples"), # soaps, cosmetics
    (2800, 2829, "Materials"),        # chemicals
    (2840, 2899, "Materials"),
    (3300, 3399, "Materials"),        # primary metals
    (2000, 2199, "Consumer Staples"), # food, tobacco
    (5400, 5499, "Consumer Staples"), # food stores
    (5140, 5149, "Consumer Staples"),
    (5900, 5912, "Consumer Staples"), # drug stores
    (2200, 2399, "Consumer Discretionary"),  # textiles, apparel
    (2500, 2599, "Consumer Discretionary"),  # furniture
    (3710, 3716, "Consumer Discretionary"),  # motor vehicles
    (3940, 3949, "Consumer Discretionary"),  # toys, sporting goods
    (5000, 5999, "Consumer Discretionary"),  # retail/wholesale (staples overrides above)
    (7000, 7099, "Consumer Discretionary"),  # hotels
    (7900, 7999, "Consumer Discretionary"),  # amusement
    (5800, 5899, "Consumer Discretionary"),  # restaurants
    (1500, 1799, "Industrials"),      # construction
    (3400, 3569, "Industrials"),      # fabricated metal, machinery
    (3580, 3599, "Industrials"),
    (3700, 3799, "Industrials"),      # aerospace, transport equipment
    (4000, 4799, "Industrials"),      # transportation
    (7380, 7389, "Industrials"),      # business services
    (8700, 8799, "Industrials"),      # engineering, management services
    (3000, 3299, "Materials"),        # rubber, plastics, stone, glass
    (100, 999, "Consumer Staples"),   # agriculture
    (1200, 1299, "Energy"),           # coal
]


def sic_to_sector(sic) -> str | None:
    try:
        code = int(sic)
    except (TypeError, ValueError):
        return None
    for lo, hi, sector in SIC_RULES:
        if lo <= code <= hi:
            return sector
    return None
