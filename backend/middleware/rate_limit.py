"""Rate limiting helpers — Redis-backed fixed-window counter.

Design goals:
  * Fail OPEN. If Redis is unavailable or anything goes wrong, the request is
    allowed. Rate limiting must never take the API down.
  * Usable two ways:
      1. As a primitive — `is_rate_limited(key, limit, window_seconds)` returns
         True when the caller has exceeded `limit` hits in the current window.
      2. As a FastAPI route decorator — `@rate_limit(requests_per_minute=60)`
         keyed by the caller's IP (falls back to a global bucket if no Request
         is found in the call args).

The decorators remain safe no-ops in environments without Redis.
"""
import logging
import time
from functools import wraps

from fastapi import HTTPException, Request, status

logger = logging.getLogger("seema.ratelimit")

_redis_client = None
_redis_unavailable = False


def _get_redis():
    """Return a cached sync Redis client, or None if it can't be reached."""
    global _redis_client, _redis_unavailable
    if _redis_client is not None:
        return _redis_client
    if _redis_unavailable:
        return None
    try:
        import redis
        from config import get_settings

        client = redis.Redis.from_url(
            get_settings().REDIS_URL,
            socket_connect_timeout=0.25,
            socket_timeout=0.25,
        )
        client.ping()
        _redis_client = client
        return client
    except Exception as e:  # pragma: no cover - depends on infra
        logger.warning(f"Rate limiting disabled — Redis unavailable: {e}")
        _redis_unavailable = True
        return None


def is_rate_limited(key: str, limit: int, window_seconds: int = 60) -> bool:
    """Fixed-window counter. Returns True if `key` has exceeded `limit` hits in
    the current window. Fails open (returns False) if Redis is unavailable."""
    client = _get_redis()
    if client is None:
        return False
    try:
        window = int(time.time()) // window_seconds
        redis_key = f"ratelimit:{key}:{window}"
        count = client.incr(redis_key)
        if count == 1:
            client.expire(redis_key, window_seconds)
        return count > limit
    except Exception as e:  # pragma: no cover
        logger.warning(f"Rate limit check failed (allowing request): {e}")
        return False


def _client_key(args, kwargs) -> str:
    """Derive a rate-limit key from a Request in the handler args, if present."""
    request = kwargs.get("request")
    if request is None:
        for a in args:
            if isinstance(a, Request):
                request = a
                break
    if request is not None and request.client:
        return request.client.host or "anonymous"
    return "global"


def rate_limit(requests_per_minute: int = 60):
    """Decorator: limit an async route to `requests_per_minute` per client IP.

    Raises HTTP 429 when exceeded. No-op (allows) when Redis is unavailable.
    """

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            key = f"{func.__module__}.{func.__name__}:{_client_key(args, kwargs)}"
            if is_rate_limited(key, requests_per_minute, 60):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded. Please slow down and try again shortly.",
                )
            return await func(*args, **kwargs)

        return wrapper

    return decorator


def check_rate_limit(limit: int = 100):
    """Backward-compatible alias of `rate_limit` (per-minute)."""
    return rate_limit(requests_per_minute=limit)
