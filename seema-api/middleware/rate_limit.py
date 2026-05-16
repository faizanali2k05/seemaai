"""Rate limiting middleware — stub for future implementation."""
from functools import wraps


def rate_limit(requests_per_minute: int = 60):
    """Decorator stub for rate limiting.

    Currently a no-op. To be implemented with Redis or in-memory tracking.

    Args:
        requests_per_minute: Maximum requests allowed per minute

    Returns:
        Decorator function
    """

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # TODO: Implement rate limiting logic with Redis
            # For now, just pass through
            return await func(*args, **kwargs)

        return wrapper

    return decorator


# No-op decorator for backward compatibility
def check_rate_limit(limit: int = 100):
    """No-op rate limit check decorator."""

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            return await func(*args, **kwargs)

        return wrapper

    return decorator
