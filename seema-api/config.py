"""Application settings — loaded from environment variables."""
import os
import sys
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Seema Compliance API"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    API_PREFIX: str = "/api"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://seema:seema@db:5432/seema"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # Auth — JWT_SECRET_KEY has NO default. The app refuses to start if the
    # env var is missing in production (see get_settings() below). In dev a
    # fallback is generated per-process so local boot still works without a
    # `.env` file — but those tokens won't validate after restart.
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "https://seemaai.co.uk",
        "https://www.seemaai.co.uk",
    ]

    # AI (optional — gracefully degrades without it)
    ANTHROPIC_API_KEY: str = ""

    # Email (optional — logs emails in dev mode without it)
    SENDGRID_API_KEY: str = ""
    EMAIL_FROM: str = "noreply@seemaai.co.uk"
    EMAIL_FROM_NAME: str = "Seema Compliance"

    # Clio PMS Integration (optional — integration features disabled without it)
    CLIO_CLIENT_ID: str = ""
    CLIO_CLIENT_SECRET: str = ""
    CLIO_REDIRECT_URI: str = "http://localhost:8000/integrations/clio/callback"
    CLIO_API_BASE: str = "https://app.clio.com"
    CLIO_API_VERSION: str = "v4"

    # Billing (optional — billing features disabled without these)
    # Two-tier pricing legacy fields (kept for backward compat):
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_ESSENTIALS_PRICE_ID: str = ""      # £200/mo – 2-10 solicitors
    STRIPE_PROFESSIONAL_PRICE_ID: str = ""    # £700/mo – 10-50 solicitors
    # Full plan × period matrix used by routers/billing.py::_get_stripe_price_id.
    # Leave any of these empty to disable that plan/period combo.
    STRIPE_PRICE_STARTER_MONTHLY: str = ""
    STRIPE_PRICE_STARTER_ANNUAL: str = ""
    STRIPE_PRICE_ESSENTIALS_MONTHLY: str = ""
    STRIPE_PRICE_ESSENTIALS_ANNUAL: str = ""
    STRIPE_PRICE_PROFESSIONAL_MONTHLY: str = ""
    STRIPE_PRICE_PROFESSIONAL_ANNUAL: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    s = Settings()

    # Fail loud in production if the JWT secret is empty. In dev we generate a
    # per-process random secret so local boot still works, but log a warning.
    if not s.JWT_SECRET_KEY:
        if s.APP_ENV == "production":
            print(
                "FATAL: JWT_SECRET_KEY is empty and APP_ENV=production. "
                "Set JWT_SECRET_KEY in the environment before starting the API.",
                file=sys.stderr,
            )
            sys.exit(1)
        # Dev fallback — random per process. Tokens won't survive restart.
        import secrets
        s.JWT_SECRET_KEY = secrets.token_urlsafe(64)
        print(
            "WARN: JWT_SECRET_KEY missing — generated a random dev secret. "
            "Tokens will not validate after restart. Set JWT_SECRET_KEY in .env.",
            file=sys.stderr,
        )

    return s
