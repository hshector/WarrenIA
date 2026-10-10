"""HTTP client with client-side rate limiting, retries and exponential backoff.

Never logs query strings (API keys travel there for some providers).
"""

from __future__ import annotations

import logging
import random
import time
from typing import Any
from urllib.parse import urlsplit

import requests

log = logging.getLogger(__name__)


class ProviderError(RuntimeError):
    """Non-retryable provider failure (auth, plan restriction, malformed response)."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class RateLimited(ProviderError):
    pass


class HttpClient:
    def __init__(
        self,
        name: str,
        min_interval: float = 0.0,
        max_retries: int = 4,
        backoff_base: float = 2.0,
        timeout: float = 30.0,
        session: requests.Session | None = None,
        sleep=time.sleep,
        headers: dict[str, str] | None = None,
    ):
        self.name = name
        self.min_interval = min_interval
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self.timeout = timeout
        self.session = session or requests.Session()
        self.sleep = sleep
        self.default_headers = headers or {}
        self._last = 0.0
        self.calls = 0

    def _throttle(self) -> None:
        wait = self.min_interval - (time.monotonic() - self._last)
        if wait > 0:
            self.sleep(wait)
        self._last = time.monotonic()

    def request(self, method: str, url: str, allow_status: set[int] | None = None, **kw: Any) -> requests.Response:
        allow_status = allow_status or set()
        headers = {**self.default_headers, **kw.pop("headers", {})}
        safe_url = urlsplit(url)._replace(query="").geturl()
        attempt = 0
        while True:
            self._throttle()
            self.calls += 1
            try:
                r = self.session.request(method, url, headers=headers, timeout=self.timeout, **kw)
            except requests.RequestException as e:
                if attempt >= self.max_retries:
                    raise ProviderError(f"{self.name}: network error on {safe_url}: {type(e).__name__}") from e
                self._backoff(attempt, None)
                attempt += 1
                continue
            if r.status_code < 400 or r.status_code in allow_status:
                return r
            if r.status_code == 429 or r.status_code >= 500:
                if attempt >= self.max_retries:
                    cls = RateLimited if r.status_code == 429 else ProviderError
                    raise cls(f"{self.name}: HTTP {r.status_code} on {safe_url} after {attempt} retries", r.status_code)
                retry_after = r.headers.get("Retry-After")
                self._backoff(attempt, float(retry_after) if retry_after and retry_after.isdigit() else None)
                attempt += 1
                continue
            raise ProviderError(f"{self.name}: HTTP {r.status_code} on {safe_url}: {r.text[:200]}", r.status_code)

    def _backoff(self, attempt: int, retry_after: float | None) -> None:
        delay = retry_after if retry_after is not None else self.backoff_base ** (attempt + 1)
        delay = min(delay, 120.0) + random.uniform(0, 0.5)
        log.warning("%s: retrying in %.1fs (attempt %d)", self.name, delay, attempt + 1)
        self.sleep(delay)

    def get_json(self, url: str, **kw: Any) -> Any:
        r = self.request("GET", url, **kw)
        try:
            return r.json()
        except ValueError as e:
            raise ProviderError(f"{self.name}: invalid JSON from {urlsplit(url)._replace(query='').geturl()}") from e
