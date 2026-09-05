"""Low-level QR check-in token primitives: generate, sign, hash, verify.

Tokens are never stored in plaintext -- only their hash (mirrors OTP's
code_hash pattern). The signed payload carries no structured/embedded IDs;
association to a gym/device/session is resolved server-side, after signature
verification succeeds, via CheckinSession.token_hash.
"""

import hashlib
import secrets

from django.core import signing

TOKEN_ENTROPY_BYTES = 32
_SALT = "apps.gyms.checkin_token"

_signer = signing.Signer(salt=_SALT)


def generate_signed_token() -> tuple[str, str]:
    """Return (signed_payload, token_hash).

    signed_payload is what the QR encodes. token_hash is what gets stored in
    CheckinSession.token_hash.
    """
    raw_value = secrets.token_urlsafe(TOKEN_ENTROPY_BYTES)
    signed_payload = _signer.sign(raw_value)
    return signed_payload, hash_raw_value(raw_value)


def hash_raw_value(raw_value: str) -> str:
    # Plain SHA-256, not make_password: this is a high-entropy random value
    # (not a low-entropy human-enterable code like an OTP), so a fast
    # deterministic hash is fine, and required -- redemption has no known
    # candidate row to check against, only the raw token, so the lookup must
    # be an equality match on token_hash, which a slow salted hash can't do.
    return hashlib.sha256(raw_value.encode()).hexdigest()


def unsign_token(signed_payload: str) -> str:
    """Verify signature and return the raw random value.

    Raises django.core.signing.BadSignature on tamper/garbage input.
    """
    return _signer.unsign(signed_payload)
