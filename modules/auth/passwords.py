"""Password hashing with scrypt from the standard library (no extra dependency)."""

import hashlib
import hmac
import secrets

# Work factors: about 64 MB and well under a second per check on a small server.
N, R, P = 2**15, 8, 2
KEY_LENGTH = 32


def _derive(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=KEY_LENGTH, maxmem=128 * 1024 * 1024
    )


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"scrypt${N}${R}${P}${salt.hex()}${_derive(password, salt, N, R, P).hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, expected = stored.split("$")
        if scheme != "scrypt":
            return False
        actual = _derive(password, bytes.fromhex(salt), int(n), int(r), int(p))
        return hmac.compare_digest(actual, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False


# Checked when the email is unknown, so a wrong email takes as long as a wrong password.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))
