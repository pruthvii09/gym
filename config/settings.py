import sys
from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

# Django's test runner forces DEBUG=False regardless of DJANGO_DEBUG, so `manage.py test`
# would otherwise hit the real Resend API with fixture emails (e.g. @example.com) -- see
# apps/common/email.py, which treats TESTING the same as DEBUG (routes through Django's
# own mail backend instead of Resend).
TESTING = "test" in sys.argv

# Only reached in DEBUG (dev) -- TESTING doesn't need this at all, since Django's test
# runner unconditionally forces EMAIL_BACKEND to the locmem backend for the duration of
# `manage.py test` (populating django.core.mail.outbox), regardless of what's set here.
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

AUTH_USER_MODEL = "users.User"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "drf_spectacular",
    # local apps
    "apps.common",
    "apps.users",
    "apps.gyms",
    "apps.checkins",
    "apps.streaks",
    "apps.rewards",
    "apps.fraud",
    "apps.challenges",
    "apps.notifications",
    "apps.audit",
    "apps.workouts",
    "apps.analytics",
    "apps.badges",
    "apps.social",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": env.db("DATABASE_URL"),
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- REST Framework -------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "EXCEPTION_HANDLER": "apps.common.exceptions.custom_exception_handler",
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.DefaultPageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # No DEFAULT_THROTTLE_CLASSES: throttling is opt-in per view via
    # ScopedRateThrottle + throttle_scope, so endpoints without an explicit
    # scope aren't silently throttled.
    "DEFAULT_THROTTLE_RATES": {
        "register": "10/hour",
        "login": "10/min",
        "email_send_verification": "3/hour",
        "email_verify": "10/hour",
        "password_forgot": "5/hour",
        "password_reset": "10/hour",
        "token_refresh": "60/min",
        "logout": "30/min",
        "gym_create": "10/hour",
        "gym_device_create": "10/hour",
        "gym_device_rotate": "10/hour",
        "gym_device_qr": "10/min",
        "checkin_create": "20/hour",
        "reward_claim": "10/hour",
        "reward_redeem": "10/hour",
        "gym_reward_redemption_verify": "30/min",
        "gym_staff_invite_create": "20/hour",
        "gym_staff_invite_accept": "20/hour",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=env.int("JWT_ACCESS_TOKEN_LIFETIME_MIN", default=15)
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=env.int("JWT_REFRESH_TOKEN_LIFETIME_DAYS", default=7)
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "GymStreak API",
    "DESCRIPTION": "GymStreak backend API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# --- Celery ----------------------------------------------------------------

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://redis:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://redis:6379/0")
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_BEAT_SCHEDULE = {}

# Under Django's test runner, run tasks synchronously in-process instead of
# queuing to a real broker/worker -- the standard pattern for testing
# Celery-integrated Django apps without a live worker. Detected via sys.argv
# rather than a separate test-settings module, matching this project's
# single-settings-file convention.
if "test" in sys.argv:
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True

REDIS_URL = env("REDIS_URL", default="redis://redis:6379/1")

# Reuses REDIS_URL (same DB the health check pings) for throttle counters and
# OTP resend-cooldowns, so rate limiting is shared across the web/worker
# containers instead of each process's own in-memory cache. Nothing else
# writes app data into this DB today, so there's no key-collision risk.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
    }
}

# --- Email -------------------------------------------------------------
# Dev: outgoing mail is printed to stdout instead of actually sent -- the
# standard local-dev pattern for exercising email flows without a real
# provider call. Prod: sent via the Resend API (see apps/common/email.py).

RESEND_API_KEY = env("RESEND_API_KEY", default="")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="no-reply@gymstreak.local")

# Base URL of the Next.js frontend -- only needed so an outbound email (gym
# staff invites) can build a link back into the app. Same role as the
# frontend's own NEXT_PUBLIC_API_URL, mirrored in reverse.
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000")

# --- OTP policy ----------------------------------------------------------
# Policy constants, not env vars -- these rarely change and don't vary by
# deployment, so keeping them in code avoids env-var sprawl.

OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_ATTEMPTS = 5

# --- Check-in QR policy ----------------------------------------------------
# Policy constant, not an env var -- mirrors OTP_* constants: rarely
# changes, doesn't vary by deployment.

CHECKIN_QR_TTL_SECONDS = 30

# --- Gym staff invite policy -------------------------------------------
# Plain settings constant, same reasoning as OTP_*/CHECKIN_QR_TTL_SECONDS.

GYM_STAFF_INVITE_EXPIRY_DAYS = 7

# --- Check-in geofencing & fraud risk-scoring policy ------------------------
# Extends the check-in policy above with the geofencing/risk-scoring
# constants used by apps.checkins/apps.fraud. Plain settings constants, same
# reasoning as OTP_*/CHECKIN_QR_TTL_SECONDS.

CHECKIN_GPS_ACCURACY_ALLOWANCE_METERS = 50
CHECKIN_GPS_ACCURACY_WARN_METERS = 30

CHECKIN_IMPOSSIBLE_TRAVEL_KMH = 900
CHECKIN_VELOCITY_WINDOW_MINUTES = 60
CHECKIN_VELOCITY_MAX_ATTEMPTS = 5
CHECKIN_SUSPICIOUS_REJECTED_THRESHOLD = 3

CHECKIN_RISK_WEIGHT_NO_DEVICE = 15
CHECKIN_RISK_WEIGHT_POOR_ACCURACY = 10
CHECKIN_RISK_WEIGHT_IMPOSSIBLE_TRAVEL = 60
CHECKIN_RISK_WEIGHT_MULTI_ACCOUNT_DEVICE = 25
CHECKIN_RISK_WEIGHT_VELOCITY = 20
CHECKIN_RISK_WEIGHT_SUSPICIOUS_PATTERN = 25

# Only CHECKIN_RISK_HIGH_THRESHOLD is consulted in the request path (score >=
# it => status=REVIEW). CHECKIN_RISK_MEDIUM_THRESHOLD is a documented
# constant for a future admin/analytics view, not branched on today.
CHECKIN_RISK_MEDIUM_THRESHOLD = 30
CHECKIN_RISK_HIGH_THRESHOLD = 60

# --- User-level fraud risk assessment policy --------------------------------
# Distinct scale/meaning from CHECKIN_RISK_* (one check-in's immediate
# context) -- a rolling window over a user's full history gets its own
# thresholds, not a reuse of CHECKIN_RISK_MEDIUM/HIGH_THRESHOLD. Replaces
# the earlier narrow REWARD_FRAUD_* check entirely: this is a strict
# superset (the same signals feed this weighted score), so keeping both
# would just be two unsynchronized fraud gates over overlapping signals.

FRAUD_RISK_LOOKBACK_DAYS = 30
FRAUD_RISK_EVENT_WEIGHTS = {
    "qr_reuse": 20,
    "gps_mismatch": 10,
    "too_many_checkins": 15,
    "impossible_travel": 30,
    "multiple_accounts_device": 25,
    "suspicious_pattern": 15,
    "device_anomaly": 10,
}
# Structural multi-account signals with a low false-positive rate --
# deliberately heavy weights.
FRAUD_RISK_WEIGHT_ACCOUNT_FARM = 40
FRAUD_RISK_WEIGHT_REWARD_FARM = 40

FRAUD_RISK_MEDIUM_THRESHOLD = 30
FRAUD_RISK_HIGH_THRESHOLD = 60

# Live account-farming detection: N+ other users sharing a device, all
# created within this window of each other.
FRAUD_ACCOUNT_FARM_MIN_USERS = 3
FRAUD_ACCOUNT_FARM_WINDOW_HOURS = 48

# Live reward-claim-farming detection: N+ other device-sharing users who
# also have at least one RewardClaim.
FRAUD_REWARD_FARM_MIN_USERS = 3

# --- CORS --------------------------------------------------------------

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = True

# --- Security ------------------------------------------------------------

SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=not DEBUG)
SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=not DEBUG)
CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=not DEBUG)
SESSION_COOKIE_HTTPONLY = True
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=0 if DEBUG else 31536000)
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https") if not DEBUG else None

# --- Logging ---------------------------------------------------------------
# Console-only: Docker captures stdout. Nothing here dumps request bodies,
# so passwords/tokens/OTPs/QR secrets never end up in logs by construction.

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "gymstreak": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
