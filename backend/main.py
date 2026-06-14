"""Seema API — SRA compliance platform for UK law firms."""
import logging
import os
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ---------------------------------------------------------------------------
# Sentry — env-gated, no-op without SENTRY_DSN. Must be initialised BEFORE
# the FastAPI app is constructed so the Sentry middleware can wrap requests.
# ---------------------------------------------------------------------------

_SENTRY_DSN = os.getenv("SENTRY_DSN", "").strip()
if _SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=_SENTRY_DSN,
            environment=settings.APP_ENV,
            release=settings.APP_VERSION,
            # Keep traces sampling conservative in production. Tune up later.
            traces_sample_rate=0.1 if settings.APP_ENV == "production" else 0.0,
            integrations=[
                StarletteIntegration(),
                FastApiIntegration(),
            ],
            send_default_pii=False,
        )
        logger.info("Sentry initialised (env=%s)", settings.APP_ENV)
    except ImportError:
        logger.warning(
            "SENTRY_DSN set but sentry-sdk not installed — `pip install sentry-sdk` "
            "or remove SENTRY_DSN from env"
        )
else:
    logger.info("Sentry not configured (SENTRY_DSN unset) — error aggregation disabled")


# ---------------------------------------------------------------------------
# Lifespan
# Alembic is the schema source of truth — table creation is handled by
# `alembic upgrade head` in entrypoint.sh, NOT by Base.metadata.create_all
# (which silently papered over schema drift between SQLAlchemy models and the
# real DB). Keep this empty unless there's a per-process resource to spin up.
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Seema API",
    description="Compliance automation platform for SRA-regulated law firms",
    version="0.1.0",
    lifespan=lifespan,
)

# -- CORS --
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -- Tier gate middleware (checks subscription limits) --
from middleware.tier_gate import TierGateMiddleware  # noqa: E402
app.add_middleware(TierGateMiddleware)


# ---------------------------------------------------------------------------
# Global exception handlers
#
# Every unhandled exception used to surface as FastAPI's default 500 with the
# full traceback rendered in the response body. These handlers replace that
# with structured JSON. Stack traces are only included when APP_ENV != prod
# (gated on settings.DEBUG so it lines up with how the rest of the app reads
# the env). Production responses never expose internals.
# ---------------------------------------------------------------------------

def _err_response(status_code: int, message: str, code: str | None = None,
                  detail: object | None = None) -> JSONResponse:
    body: dict = {
        "error": True,
        "message": message,
        "statusCode": status_code,
    }
    if code:
        body["code"] = code
    if detail is not None and settings.DEBUG:
        body["detail"] = detail
    return JSONResponse(status_code=status_code, content=body)


@app.exception_handler(StarletteHTTPException)
async def _http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Return our structured envelope for HTTPException (incl. raised by deps)."""
    return _err_response(
        status_code=exc.status_code,
        message=str(exc.detail) if exc.detail else "Request failed",
    )


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all for unhandled exceptions — logs full trace, returns sanitised JSON."""
    logger.exception(
        "Unhandled exception on %s %s", request.method, request.url.path,
    )
    return _err_response(
        status_code=500,
        message="Internal server error",
        code="INTERNAL_ERROR",
        detail=traceback.format_exc() if settings.DEBUG else None,
    )


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

from routers.auth import router as auth_router  # noqa: E402
from routers.dashboard import router as dashboard_router  # noqa: E402
from routers.compliance import router as compliance_router  # noqa: E402
from routers.regulatory import router as regulatory_router  # noqa: E402
from routers.aml import router as aml_router  # noqa: E402
from routers.breach import router as breach_router  # noqa: E402
from routers.intake import router as intake_router  # noqa: E402
from routers.matters import router as matters_router  # noqa: E402
from routers.conflicts import router as conflicts_router  # noqa: E402
from routers.undertakings import router as undertakings_router  # noqa: E402
from routers.complaints import router as complaints_router  # noqa: E402
from routers.evidence import router as evidence_router  # noqa: E402
from routers.policies import router as policies_router  # noqa: E402
from routers.staff import router as staff_router  # noqa: E402
from routers.staff_portal import router as staff_portal_router  # noqa: E402
from routers.accounts import router as accounts_router  # noqa: E402
from routers.chasers import router as chasers_router  # noqa: E402
from routers.audit import router as audit_router  # noqa: E402
from routers.sra_return import router as sra_return_router  # noqa: E402
from routers.key_dates import router as key_dates_router  # noqa: E402
from routers.deadlines import router as deadlines_router  # noqa: E402
from routers.supervision import router as supervision_router  # noqa: E402
from routers.remediation import router as remediation_router  # noqa: E402
from routers.data_mgmt import router as data_mgmt_router  # noqa: E402
from routers.email_admin import router as email_admin_router  # noqa: E402
from routers.integrations import router as integrations_router  # noqa: E402
from routers.billing import router as billing_router  # noqa: E402
from routers.onboarding import router as onboarding_router  # noqa: E402
from routers.validation import router as validation_router  # noqa: E402
from routers.ai import router as ai_router  # noqa: E402
from routers.tier import router as tier_router  # noqa: E402
from routers.sra_audit_pack import router as sra_audit_pack_router  # noqa: E402
from routers.file_review import router as file_review_router  # noqa: E402
from routers.reconciliation import router as reconciliation_router  # noqa: E402
from routers.packs import router as packs_router  # noqa: E402
from routers.pii_renewal import router as pii_renewal_router  # noqa: E402

API_PREFIX = "/api"

app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(dashboard_router, prefix=API_PREFIX)
app.include_router(compliance_router, prefix=API_PREFIX)
app.include_router(regulatory_router, prefix=API_PREFIX)
app.include_router(aml_router, prefix=API_PREFIX)
app.include_router(breach_router, prefix=API_PREFIX)
app.include_router(intake_router, prefix=API_PREFIX)
app.include_router(matters_router, prefix=API_PREFIX)
app.include_router(conflicts_router, prefix=API_PREFIX)
app.include_router(undertakings_router, prefix=API_PREFIX)
app.include_router(complaints_router, prefix=API_PREFIX)
app.include_router(evidence_router, prefix=API_PREFIX)
app.include_router(policies_router, prefix=API_PREFIX)
app.include_router(staff_router, prefix=API_PREFIX)
app.include_router(staff_portal_router, prefix=API_PREFIX)
app.include_router(accounts_router, prefix=API_PREFIX)
app.include_router(chasers_router, prefix=API_PREFIX)
app.include_router(audit_router, prefix=API_PREFIX)
app.include_router(sra_return_router, prefix=API_PREFIX)
app.include_router(key_dates_router, prefix=API_PREFIX)
app.include_router(deadlines_router, prefix=API_PREFIX)
app.include_router(supervision_router, prefix=API_PREFIX)
app.include_router(remediation_router, prefix=API_PREFIX)
app.include_router(data_mgmt_router, prefix=API_PREFIX)
app.include_router(email_admin_router, prefix=API_PREFIX)
app.include_router(integrations_router, prefix=API_PREFIX)
app.include_router(billing_router, prefix=API_PREFIX)
app.include_router(onboarding_router, prefix=API_PREFIX)
app.include_router(validation_router, prefix=API_PREFIX)
app.include_router(ai_router, prefix=API_PREFIX)
app.include_router(tier_router, prefix=API_PREFIX)
app.include_router(sra_audit_pack_router, prefix=API_PREFIX)
app.include_router(file_review_router, prefix=API_PREFIX)
app.include_router(reconciliation_router, prefix=API_PREFIX)
app.include_router(packs_router, prefix=API_PREFIX)
app.include_router(pii_renewal_router, prefix=API_PREFIX)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "service": "seema-api"}
