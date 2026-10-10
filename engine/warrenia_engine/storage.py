"""Object storage abstraction: local filesystem (dev/tests) or Supabase Storage (prod).

Everything the engine persists (raw data lake, snapshots, published artifacts) goes
through this interface so the same pipeline runs locally and in GitHub Actions.
"""

from __future__ import annotations

import gzip
import io
import json
import logging
import os
from pathlib import Path
from typing import Any, Protocol

import pandas as pd

from .http import HttpClient

log = logging.getLogger(__name__)


class Storage(Protocol):
    def read_bytes(self, path: str) -> bytes | None: ...
    def write_bytes(self, path: str, data: bytes, content_type: str = "application/octet-stream") -> None: ...
    def list(self, prefix: str) -> list[str]: ...
    def delete(self, paths: list[str]) -> None: ...


class LocalStorage:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _p(self, path: str) -> Path:
        p = (self.root / path).resolve()
        if self.root.resolve() not in p.parents and p != self.root.resolve():
            raise ValueError(f"path escapes storage root: {path}")
        return p

    def read_bytes(self, path: str) -> bytes | None:
        p = self._p(path)
        return p.read_bytes() if p.exists() else None

    def write_bytes(self, path: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        p = self._p(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(p)  # atomic on POSIX

    def list(self, prefix: str) -> list[str]:
        base = self._p(prefix) if prefix else self.root
        if not base.exists():
            return []
        if base.is_file():
            return [prefix]
        return sorted(str(p.relative_to(self.root)) for p in base.rglob("*") if p.is_file() and not p.name.endswith(".tmp"))

    def delete(self, paths: list[str]) -> None:
        for path in paths:
            p = self._p(path)
            if p.exists():
                p.unlink()


class SupabaseStorage:
    """Minimal Supabase Storage REST client (private bucket, service-role key)."""

    def __init__(self, url: str, service_key: str, bucket: str, http: HttpClient | None = None):
        self.base = url.rstrip("/") + "/storage/v1"
        self.bucket = bucket
        self.http = http or HttpClient(name="supabase", min_interval=0.0, max_retries=4)
        # New-style secret keys (sb_secret_...) go in `apikey` only; legacy JWT keys also as Bearer.
        self.headers = {"apikey": service_key}
        if service_key.startswith("eyJ"):
            self.headers["Authorization"] = f"Bearer {service_key}"

    def read_bytes(self, path: str) -> bytes | None:
        r = self.http.request("GET", f"{self.base}/object/{self.bucket}/{path}", headers=self.headers, allow_status={400, 404})
        if r.status_code in (400, 404):
            return None
        return r.content

    def write_bytes(self, path: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        headers = {**self.headers, "Content-Type": content_type, "x-upsert": "true", "cache-control": "no-cache"}
        self.http.request("POST", f"{self.base}/object/{self.bucket}/{path}", headers=headers, data=data)

    def list(self, prefix: str) -> list[str]:
        """Recursive listing (Supabase lists one level per call)."""
        out: list[str] = []
        stack = [prefix.rstrip("/")]
        while stack:
            folder = stack.pop()
            offset = 0
            while True:
                r = self.http.request(
                    "POST",
                    f"{self.base}/object/list/{self.bucket}",
                    headers={**self.headers, "Content-Type": "application/json"},
                    data=json.dumps({"prefix": folder, "limit": 1000, "offset": offset}),
                )
                items = r.json()
                for it in items:
                    name = f"{folder}/{it['name']}" if folder else it["name"]
                    if it.get("id") is None:  # folder
                        stack.append(name)
                    else:
                        out.append(name)
                if len(items) < 1000:
                    break
                offset += 1000
        return sorted(out)

    def delete(self, paths: list[str]) -> None:
        for i in range(0, len(paths), 500):
            self.http.request(
                "DELETE",
                f"{self.base}/object/{self.bucket}",
                headers={**self.headers, "Content-Type": "application/json"},
                data=json.dumps({"prefixes": paths[i : i + 500]}),
            )


def storage_from_env() -> Storage:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if url and key:
        bucket = os.environ.get("SUPABASE_BUCKET", "market")
        log.info("storage: supabase bucket=%s", bucket)
        return SupabaseStorage(url, key, bucket)
    root = os.environ.get("WARRENIA_DATA_DIR", str(Path(__file__).resolve().parents[2] / "data"))
    log.info("storage: local %s", root)
    return LocalStorage(root)


# ---------------------------------------------------------------- helpers

def write_json(storage: Storage, path: str, obj: Any, gz: bool | None = None) -> None:
    raw = json.dumps(obj, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()
    if gz is None:
        gz = path.endswith(".gz")
    if gz:
        storage.write_bytes(path, gzip.compress(raw, mtime=0), "application/gzip")
    else:
        storage.write_bytes(path, raw, "application/json")


def read_json(storage: Storage, path: str) -> Any | None:
    data = storage.read_bytes(path)
    if data is None:
        return None
    if path.endswith(".gz"):
        data = gzip.decompress(data)
    return json.loads(data)


def write_parquet(storage: Storage, path: str, df: pd.DataFrame) -> None:
    buf = io.BytesIO()
    df.to_parquet(buf, index=False, compression="zstd")
    storage.write_bytes(path, buf.getvalue(), "application/vnd.apache.parquet")


def read_parquet(storage: Storage, path: str) -> pd.DataFrame | None:
    data = storage.read_bytes(path)
    if data is None:
        return None
    return pd.read_parquet(io.BytesIO(data))
