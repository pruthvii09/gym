import re

from django.contrib.auth.base_user import BaseUserManager

USERNAME_MAX_LENGTH = 30


class UserManager(BaseUserManager):
    use_in_migrations = True

    def generate_unique_username(self, seed: str) -> str:
        """Slugify `seed` (typically the email local-part) into a valid,
        available username -- lowercase alnum/underscore only, 3-30 chars,
        suffixed with a number on collision. Used both as create_user's
        fallback when no username is supplied (tests, fixtures, the Django
        admin "add user" form) and duplicated (not imported -- migrations
        don't import live code, same reasoning as
        streaks/migrations/0002_seed_default_policy.py) by the migration
        that backfills existing accounts.
        """
        base = re.sub(r"[^a-z0-9_]", "", seed.lower())[:USERNAME_MAX_LENGTH] or "user"
        if len(base) < 3:
            base = base.ljust(3, "0")
        candidate = base
        suffix = 1
        while self.filter(username=candidate).exists():
            suffix += 1
            suffix_str = str(suffix)
            candidate = f"{base[: USERNAME_MAX_LENGTH - len(suffix_str)]}{suffix_str}"
        return candidate

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address.")
        email = self.normalize_email(email)
        if not extra_fields.get("username"):
            extra_fields["username"] = self.generate_unique_username(email.split("@")[0])
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email, password, **extra_fields)
