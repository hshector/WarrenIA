import json

import pytest

from warrenia_engine.public import _strip_prices, build, check
from warrenia_engine.storage import LocalStorage, write_json

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def published(tmp_path):
    st = LocalStorage(tmp_path / "store")
    row = {"t": "AAA", "n": "Aaa Corp", "cls": "stock", "px": 123.45, "s50": 0.05, "m": 90.0, "rank": 1, "why": ["Strong"]}
    write_json(st, "published/latest.json", {"run_id": "r1", "data_asof": "2026-10-22", "demo": False, "path": "runs/r1"})
    write_json(st, "published/runs/r1/meta.json", {"reports": {"stock": [{"ticker": "AAA", "invalidation": [
        "A close below its 50-day average (today 120.10; price is +2.8% from it).",
        "Trend strength dropping below 50/100 (today 90/100).",
        "The 50-day average falling below the 200-day (today 120.10 vs 110.00).",
    ]}]}})
    write_json(st, "published/runs/r1/market.json", {"benchmarks": {"SPY": {"price": 580.1, "r1m": 0.02}}})
    write_json(st, "published/runs/r1/radar.json.gz", {"asof": "2026-10-22", "bench": {}, "rows": [row]})
    write_json(st, "published/runs/r1/excluded.json.gz", [{"t": "ZZZ", "px": 1.0, "reasons": ["Too cheap"]}])
    write_json(st, "published/runs/r1/assets/A.json.gz", {
        "AAA": {"row": row, "indicators": {"price": 123.45, "sma50": 120.1, "r1m": 0.04},
                "action": {"action": "wait", "entry": "Better entry: when the price comes back towards its 50-day average "
                           "(today $120.10) and the last month's jump cools off."},
                "report": {"invalidation": ["A close below its 50-day average (today 120.10; price is +2.8% from it)."]},
                "series": {"c": [1.0, 2.0], "v": [1, 2]}, "events": [["2026-01-02", 2.0, "split", "2:1"]], "hist": {"d": [], "r": [], "o": []}},
        # a benchmark: only its price series, never published
        "SPY": {"series": {"c": [1.0], "v": [1]}},
    })
    write_json(st, "published/signals.json", {"asof": "2026-10-22", "events": [{"t": "AAA", "from": "watch", "to": "wait"}]})
    st.write_bytes("published/logos/AAA.png", PNG, "image/png")
    st.write_bytes("published/logos/OLD.png", PNG, "image/png")  # no longer in the radar
    return st


def test_build_keeps_the_analysis_and_drops_every_price(tmp_path):
    out = tmp_path / "out"
    summary = build(published(tmp_path), out)
    assert summary == {"run_id": "r1", "data_asof": "2026-10-22", "demo": False, "rows": 1, "assets": 1, "logos": 1}
    assert json.loads((out / "latest.json").read_text())["files"] == ["signals.json"]
    radar = json.loads((out / "radar.json").read_text())
    assert radar["rows"][0]["px"] is None and radar["rows"][0]["m"] == 90.0 and radar["rows"][0]["s50"] == 0.05
    a = json.loads((out / "assets" / "AAA.json").read_text())
    assert "series" not in a and "events" not in a and "hist" in a
    assert a["indicators"] == {"r1m": 0.04}
    assert a["action"]["entry"] == "Better entry: when the price comes back towards its 50-day average and the last month's jump cools off."
    assert a["report"]["invalidation"] == ["A close below its 50-day average (price is +2.8% from it)."]
    meta = json.loads((out / "meta.json").read_text())
    assert meta["reports"]["stock"][0]["invalidation"] == [
        "A close below its 50-day average (price is +2.8% from it).",
        "Trend strength dropping below 50/100 (today 90/100).",
        "The 50-day average falling below the 200-day.",
    ]
    assert json.loads((out / "market.json").read_text())["benchmarks"]["SPY"] == {"r1m": 0.02}
    assert json.loads((out / "excluded.json").read_text())[0]["px"] is None
    assert not (out / "assets" / "SPY.json").exists()
    assert sorted(p.name for p in (out / "logos").iterdir()) == ["AAA.png", "index.json"]
    assert "Logo.dev" in (out / "SOURCES.md").read_text()


@pytest.mark.parametrize("text,clean", [
    ("x (today 12.5; price is +1% from it).", "x (price is +1% from it)."),
    ("x (today $1,234.50) and y.", "x and y."),
    ("x (today 70/100).", "x (today 70/100)."),
])
def test_strip_prices(text, clean):
    assert _strip_prices(text) == clean


def test_check_fails_on_a_price_that_slips_through(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "AAA.json").write_text(json.dumps({"row": {"px": 1.5}}))
    with pytest.raises(ValueError, match="price left"):
        check(tmp_path)
    (tmp_path / "assets" / "AAA.json").write_text(json.dumps({"report": {"risks": ["Support at today 99.5 dollars"]}}))
    with pytest.raises(ValueError, match="price quoted"):
        check(tmp_path)
