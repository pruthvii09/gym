from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.core.validators import RegexValidator
from django.db import models

from apps.common.models import UUIDTimeStampedModel
from apps.users.managers import UserManager

phone_validator = RegexValidator(
    regex=r"^\+?[0-9]{7,15}$",
    message="Enter a valid phone number (7-15 digits, optional leading +).",
)

username_validator = RegexValidator(
    regex=r"^[a-z0-9_]{3,30}$",
    message="Usernames can only contain lowercase letters, numbers, and underscores (3-30 characters).",
)


class User(UUIDTimeStampedModel, AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True, db_index=True)
    # Nullable only at the DB/migration-history level (existing rows were
    # backfilled in migration 0004) -- application code always requires one:
    # UserManager.create_user auto-generates a unique one when the caller
    # doesn't supply it, and RegisterSerializer requires it explicitly from
    # a real signup. Powers the public profile/search surface -- never used
    # for auth (email remains USERNAME_FIELD).
    username = models.CharField(max_length=30, unique=True, validators=[username_validator])
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        unique=True,
        validators=[phone_validator],
    )
    email_verified = models.BooleanField(default=False)
    phone_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.email


class OTP(UUIDTimeStampedModel):
    class Purpose(models.TextChoices):
        EMAIL_VERIFICATION = "email_verification", "Email verification"
        PHONE_VERIFICATION = "phone_verification", "Phone verification"
        PASSWORD_RESET = "password_reset", "Password reset"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="otps")
    purpose = models.CharField(max_length=32, choices=Purpose.choices)
    destination = models.CharField(max_length=254)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "purpose", "consumed_at"]),
        ]

    def __str__(self):
        return f"{self.purpose} OTP for {self.user_id}"


class UserDevice(UUIDTimeStampedModel):
    class Platform(models.TextChoices):
        IOS = "ios", "iOS"
        ANDROID = "android", "Android"
        WEB = "web", "Web"
        OTHER = "other", "Other"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="devices")
    device_hash = models.CharField(max_length=255)
    platform = models.CharField(max_length=16, choices=Platform.choices, default=Platform.OTHER)
    first_seen_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    trusted = models.BooleanField(default=False)

    class Meta:
        unique_together = ("user", "device_hash")

    def __str__(self):
        return f"{self.device_hash} ({self.platform})"
