"""Configuration loading. All methodology parameters live in /config/*.yaml."""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]


def config_dir() -> Path:
    return Path(os.environ.get("WARRENIA_CONFIG_DIR", REPO_ROOT / "config"))


@dataclass(frozen=True)
class Config:
    universe: dict[str, Any]
    momentum: dict[str, Any]
    benchmarks: dict[str, Any]

    @property
    def hash(self) -> str:
        payload = json.dumps(
            {"universe": self.universe, "momentum": self.momentum, "benchmarks": self.benchmarks},
            sort_keys=True,
            default=str,
        )
        return hashlib.sha256(payload.encode()).hexdigest()[:12]

    @property
    def windows(self) -> dict[str, int]:
        return self.momentum["windows"]

    @property
    def primary_benchmark(self) -> str:
        return self.benchmarks["primary"]

    @property
    def benchmark_tickers(self) -> list[str]:
        return list(self.benchmarks["options"].keys())

    @property
    def sector_etfs(self) -> dict[str, str]:
        return dict(self.benchmarks["sectors"])

    @property
    def reference_tickers(self) -> list[str]:
        """Tickers that must always be loaded (benchmarks + sector ETFs)."""
        return sorted(set(self.benchmark_tickers) | set(self.sector_etfs.values()) | {self.primary_benchmark})

    def with_overrides(self, momentum: dict[str, Any] | None = None) -> "Config":
        m = json.loads(json.dumps(self.momentum))
        if momentum:
            _deep_update(m, momentum)
        return Config(universe=self.universe, momentum=m, benchmarks=self.benchmarks)


def _deep_update(base: dict, upd: dict) -> None:
    for k, v in upd.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _deep_update(base[k], v)
        else:
            base[k] = v


def load_config(directory: Path | None = None) -> Config:
    d = Path(directory) if directory else config_dir()

    def _load(name: str) -> dict[str, Any]:
        with open(d / name, encoding="utf-8") as fh:
            return yaml.safe_load(fh)

    cfg = Config(
        universe=_load("universe.yaml"),
        momentum=_load("momentum.yaml"),
        benchmarks=_load("benchmarks.yaml"),
    )
    _validate(cfg)
    return cfg


def _validate(cfg: Config) -> None:
    for score, comps in cfg.momentum["scores"].items():
        total = sum(comps.values())
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f"weights of score '{score}' sum to {total}, expected 1.0")
    total = sum(cfg.momentum["overall"].values())
    if abs(total - 1.0) > 1e-6:
        raise ValueError(f"overall weights sum to {total}, expected 1.0")
    if cfg.primary_benchmark not in cfg.benchmarks["options"]:
        raise ValueError("primary benchmark must be one of benchmark options")
