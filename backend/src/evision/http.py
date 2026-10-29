"""HTTP helpers: shared sessions, throttling, retry, and on-disk response caching."""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from pathlib import Path

import requests
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .config import RAW_DIR, get_settings

log = logging.getLogger(__name__)

_lock = threading.Lock()
_last_hit: dict[str, float] = {}


class TransientHTTPError(RuntimeError):
    """Raised for statuses worth retrying (429/5xx)."""


def new_session(extra_headers: dict[str, str] | None = None) -> requests.Session:
    settings = get_settings()
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": settings.user_agent,
            "Accept-Language": "en-IN,en;q=0.9",
        }
    )
    if extra_headers:
        session.headers.update(extra_headers)
    return session


def _throttle(host: str) -> None:
    """Space out requests per host *and per thread*.

    Keying on the thread lets a small worker pool fetch in parallel while each
    worker still respects the politeness delay, instead of all workers queueing
    behind one global timer.
    """
    delay = get_settings().request_delay
    key = f"{host}:{threading.get_ident()}"
    with _lock:
        now = time.monotonic()
        last = _last_hit.get(key, 0.0)
        wait = delay - (now - last)
        if wait > 0:
            time.sleep(wait)
        _last_hit[key] = time.monotonic()


@retry(
    retry=retry_if_exception_type((TransientHTTPError, requests.ConnectionError, requests.Timeout)),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    reraise=True,
)
def get(session: requests.Session, url: str, **kwargs) -> requests.Response:
    settings = get_settings()
    kwargs.setdefault("timeout", settings.request_timeout)
    host = requests.utils.urlparse(url).netloc
    _throttle(host)
    log.debug("GET %s", url)
    resp = session.get(url, **kwargs)
    if resp.status_code == 429 or resp.status_code >= 500:
        raise TransientHTTPError(f"{resp.status_code} from {url}")
    return resp


@retry(
    retry=retry_if_exception_type((TransientHTTPError, requests.ConnectionError, requests.Timeout)),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    reraise=True,
)
def post(session: requests.Session, url: str, **kwargs) -> requests.Response:
    settings = get_settings()
    kwargs.setdefault("timeout", settings.request_timeout)
    host = requests.utils.urlparse(url).netloc
    _throttle(host)
    log.debug("POST %s", url)
    resp = session.post(url, **kwargs)
    if resp.status_code == 429 or resp.status_code >= 500:
        raise TransientHTTPError(f"{resp.status_code} from {url}")
    return resp


def cache_path(source: str, name: str, suffix: str = "html") -> Path:
    directory = RAW_DIR / source
    directory.mkdir(parents=True, exist_ok=True)
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in name)
    return directory / f"{safe}.{suffix}"


def write_cache(source: str, name: str, content: str | bytes, suffix: str = "html") -> Path:
    path = cache_path(source, name, suffix)
    mode = "wb" if isinstance(content, bytes) else "w"
    kwargs = {} if isinstance(content, bytes) else {"encoding": "utf-8"}
    with path.open(mode, **kwargs) as fh:
        fh.write(content)
    log.info("cached %s -> %s (%d bytes)", source, path.name, len(content))
    return path


def digest(value: str | bytes) -> str:
    payload = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(payload).hexdigest()[:16]
