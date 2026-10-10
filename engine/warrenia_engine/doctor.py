"""Configuration check: `python -m warrenia_engine doctor`.

Verifies every external dependency in seconds, before the long ingest, and says
in plain Spanish what is wrong and where to fix it. Never prints secret values.
"""

from __future__ import annotations

import base64
import json
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import requests

from .calendar import last_closed_session
from .storage import supabase_base_url, supabase_headers

SECRETS_PAGE = "GitHub → Settings → Secrets and variables → Actions"


@dataclass
class Check:
    name: str
    ok: bool
    detail: str
    fatal: bool = True


def key_kind(key: str) -> str:
    """'secret' | 'publishable' | 'service_role' | 'anon' | 'unknown' (JWT role decoded, not verified)."""
    k = key.strip()
    if k.startswith("sb_secret_"):
        return "secret"
    if k.startswith("sb_publishable_"):
        return "publishable"
    if k.startswith("eyJ") and k.count(".") == 2:
        try:
            payload = k.split(".")[1]
            payload += "=" * (-len(payload) % 4)
            role = json.loads(base64.urlsafe_b64decode(payload)).get("role")
            return role if role in ("service_role", "anon") else "unknown"
        except (ValueError, json.JSONDecodeError):
            return "unknown"
    return "unknown"


def _check_url(raw: str) -> tuple[Check, str | None]:
    base = supabase_base_url(raw)
    if not re.fullmatch(r"https://[a-z0-9]{20}\.supabase\.co", base):
        return Check("SUPABASE_URL", False,
                     f"No tiene la forma https://<ref>.supabase.co. Corrígelo en {SECRETS_PAGE}. "
                     "Valor correcto: Supabase → Project Settings → Data API → Project URL."), None
    note = " (tenía una ruta o barra final; se ignora)" if base != raw.strip() else ""
    return Check("SUPABASE_URL", True, f"Formato correcto{note}."), base


def _check_key(key: str) -> Check:
    kind = key_kind(key)
    if kind in ("secret", "service_role"):
        return Check("SUPABASE_SERVICE_ROLE_KEY", True, f"Es una clave de administrador ({kind}).")
    where = "Supabase → Project Settings → API Keys → Secret keys → copiar la clave sb_secret_…"
    if kind == "publishable":
        msg = "Has puesto la clave PUBLISHABLE (sb_publishable_…). Aquí va la SECRET (sb_secret_…)."
    elif kind == "anon":
        msg = "Has puesto la clave anon. Aquí va la service_role o, mejor, la secret (sb_secret_…)."
    else:
        msg = "No parece una clave de Supabase."
    return Check("SUPABASE_SERVICE_ROLE_KEY", False, f"{msg} Cámbiala en {SECRETS_PAGE}. Dónde está: {where}.")


def _check_storage(base: str, key: str, bucket: str) -> list[Check]:
    h = supabase_headers(key)
    s = requests.Session()
    out: list[Check] = []
    try:
        r = s.get(f"{base}/storage/v1/bucket/{bucket}", headers=h, timeout=20)
    except requests.RequestException as e:
        return [Check("Supabase Storage", False, f"No se puede conectar ({type(e).__name__}).")]
    if r.status_code in (400, 404) and "not found" in r.text.lower():
        return [Check("Bucket", False, f"No existe el bucket '{bucket}': falta ejecutar supabase/migrations/0001_init.sql "
                                       "en Supabase → SQL Editor.")]
    if r.status_code >= 400:
        return [Check("Bucket", False, f"Supabase respondió {r.status_code}: {r.text[:160]}")]
    out.append(Check("Bucket", True, f"'{bucket}' existe."))
    path = f"_doctor/ping-{int(time.time())}.txt"
    w = s.post(f"{base}/storage/v1/object/{bucket}/{path}", data=b"ok",
               headers={**h, "Content-Type": "text/plain", "x-upsert": "true"}, timeout=20)
    if w.status_code >= 400:
        hint = (" La clave no tiene permisos de administrador: usa la secret (sb_secret_…)."
                if "row-level security" in w.text else "")
        out.append(Check("Escritura en Storage", False, f"Supabase respondió {w.status_code}: {w.text[:160]}.{hint}"))
        return out
    rd = s.get(f"{base}/storage/v1/object/{bucket}/{path}", headers=h, timeout=20)
    s.delete(f"{base}/storage/v1/object/{bucket}", headers={**h, "Content-Type": "application/json"},
             data=json.dumps({"prefixes": [path]}), timeout=20)
    out.append(Check("Escritura en Storage", rd.status_code == 200 and rd.content == b"ok",
                     "Escribe, lee y borra correctamente." if rd.status_code == 200 else f"Lectura: {rd.status_code}"))
    return out


def _check_db(base: str, key: str) -> Check:
    try:
        r = requests.get(f"{base}/rest/v1/instruments?select=id&limit=1", headers=supabase_headers(key), timeout=20)
    except requests.RequestException as e:
        return Check("Base de datos", False, f"No se puede conectar ({type(e).__name__}).")
    if r.status_code == 200:
        return Check("Base de datos", True, "Tablas creadas.")
    if r.status_code == 404 or "PGRST205" in r.text or "does not exist" in r.text:
        return Check("Base de datos", False, "Faltan las tablas: ejecuta supabase/migrations/0001_init.sql en Supabase → SQL Editor.")
    return Check("Base de datos", False, f"Supabase respondió {r.status_code}: {r.text[:160]}")


def _check_massive(key: str, now: datetime) -> Check:
    base = os.environ.get("MASSIVE_BASE_URL", "https://api.polygon.io").rstrip("/")
    day = last_closed_session(now).session.isoformat()
    try:
        r = requests.get(f"{base}/v2/aggs/grouped/locale/us/market/stocks/{day}",
                         params={"adjusted": "false", "apiKey": key}, timeout=30)
    except requests.RequestException as e:
        return Check("MASSIVE_API_KEY", False, f"No se puede conectar con Massive ({type(e).__name__}).")
    if r.status_code == 200:
        n = len((r.json() or {}).get("results") or [])
        return Check("MASSIVE_API_KEY", True, f"Clave válida ({n} valores el {day}).")
    if r.status_code in (401, 403):
        return Check("MASSIVE_API_KEY", False, f"Massive rechaza la clave ({r.status_code}). Cópiala de massive.com → Dashboard → API Keys "
                                              f"y pégala en {SECRETS_PAGE}.")
    if r.status_code == 429:
        return Check("MASSIVE_API_KEY", True, "Clave aceptada (límite de peticiones alcanzado momentáneamente).", fatal=False)
    return Check("MASSIVE_API_KEY", False, f"Massive respondió {r.status_code}.")


def _check_sec(ua: str) -> Check:
    if not ua:
        return Check("SEC_USER_AGENT", False, "No configurado: sin capitalización ni sectores.", fatal=False)
    if not re.search(r"\S+\s+\S+@\S+\.\S+", ua):
        return Check("SEC_USER_AGENT", False, 'Debe ser "Nombre email@dominio.com", por ejemplo "WarrenIA tu@gmail.com".')
    try:
        r = requests.get("https://www.sec.gov/files/company_tickers_exchange.json", headers={"User-Agent": ua}, timeout=30)
    except requests.RequestException as e:
        return Check("SEC_USER_AGENT", False, f"No se puede conectar con la SEC ({type(e).__name__}).", fatal=False)
    return Check("SEC_USER_AGENT", r.status_code == 200, "La SEC acepta las peticiones." if r.status_code == 200
                 else f"La SEC respondió {r.status_code}.", fatal=False)


def run_doctor(now: datetime | None = None, require_massive: bool = True) -> tuple[bool, list[Check]]:
    now = now or datetime.now(timezone.utc)
    checks: list[Check] = []
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY") or ""
    bucket = os.environ.get("SUPABASE_BUCKET", "market")
    if not url:
        checks.append(Check("SUPABASE_URL", False, f"Falta el secret en {SECRETS_PAGE}."))
    if not key:
        checks.append(Check("SUPABASE_SERVICE_ROLE_KEY", False, f"Falta el secret en {SECRETS_PAGE}."))
    base = None
    if url:
        c, base = _check_url(url)
        checks.append(c)
    if key:
        checks.append(_check_key(key))
    if base and key:
        checks.extend(_check_storage(base, key, bucket))
        checks.append(_check_db(base, key))
    mkey = os.environ.get("MASSIVE_API_KEY", "")
    if mkey:
        checks.append(_check_massive(mkey, now))
    elif require_massive:
        checks.append(Check("MASSIVE_API_KEY", False, f"Falta el secret en {SECRETS_PAGE}."))
    checks.append(_check_sec(os.environ.get("SEC_USER_AGENT", "")))
    ok = all(c.ok or not c.fatal for c in checks)
    return ok, checks


def report(checks: list[Check]) -> str:
    lines = ["| | Comprobación | Resultado |", "|---|---|---|"]
    for c in checks:
        icon = "✅" if c.ok else ("❌" if c.fatal else "⚠️")
        lines.append(f"| {icon} | {c.name} | {c.detail} |")
    return "\n".join(lines)
