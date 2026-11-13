"""
Talking to the push services: Apple (APNs) for iPhones, Web Push for browsers.

Both are configured with environment variables and stay switched off until
their keys are set, so the rest of the app works without them.

  Apple:    APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_PRIVATE_KEY (the .p8 file's text)
  Browsers: VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: contact, required by the spec)
"""

import base64
import json
import os
import time
from dataclasses import dataclass
from urllib.parse import urlsplit

import httpx
import jwt
from cryptography.hazmat.primitives import serialization
from dotenv import load_dotenv
from py_vapid import Vapid
from pywebpush import WebPushException, webpush

load_dotenv()

APNS_HOSTS = {
    "production": "https://api.push.apple.com",
    "sandbox": "https://api.sandbox.push.apple.com",
}
# Apple rejects provider tokens older than an hour and throttles ones made too often.
APNS_TOKEN_LIFETIME = 40 * 60

# Push subscriptions come from the public, and we POST to the URL inside them.
# Only real browser push services are allowed, so nobody can aim our server
# at an address of their choosing.
WEB_PUSH_HOSTS = (
    "fcm.googleapis.com",
    ".push.services.mozilla.com",
    ".push.apple.com",
    ".notify.windows.com",
)


@dataclass
class PushResult:
    ok: bool
    # The device or browser unsubscribed: stop sending to it.
    gone: bool = False
    error: str | None = None


# ---------------------------------------------------------------- Apple


def _env(name: str) -> str:
    return os.getenv(name, "").strip()


def apns_configured() -> bool:
    return all(_env(n) for n in ("APNS_KEY_ID", "APNS_TEAM_ID", "APNS_BUNDLE_ID", "APNS_PRIVATE_KEY"))


_apns_token: tuple[str, float] | None = None


def _apns_provider_token() -> str:
    global _apns_token
    now = time.time()
    if _apns_token and now - _apns_token[1] < APNS_TOKEN_LIFETIME:
        return _apns_token[0]
    # Hosting dashboards often store the key on one line with literal "\n".
    key = _env("APNS_PRIVATE_KEY").replace("\\n", "\n")
    token = jwt.encode(
        {"iss": _env("APNS_TEAM_ID"), "iat": int(now)},
        key,
        algorithm="ES256",
        headers={"kid": _env("APNS_KEY_ID")},
    )
    _apns_token = (token, now)
    return token


def send_apns(device_token: str, environment: str, title: str, body: str, data: dict) -> PushResult:
    if not apns_configured():
        return PushResult(ok=False, error="APNs is not configured")
    # APNS_HOST exists so tests can point at a stand-in server.
    host = _env("APNS_HOST") or APNS_HOSTS[environment]
    payload = {
        "aps": {
            "alert": {"title": title, "body": body},
            "sound": "default",
            # Lets the alert through Focus modes: the order is waiting right now.
            "interruption-level": "time-sensitive",
        },
        **data,
    }
    try:
        with httpx.Client(http2=True, timeout=10) as client:
            response = client.post(
                f"{host}/3/device/{device_token}",
                json=payload,
                headers={
                    "authorization": f"bearer {_apns_provider_token()}",
                    "apns-topic": _env("APNS_BUNDLE_ID"),
                    "apns-push-type": "alert",
                    "apns-priority": "10",
                    # If the phone is offline, keep trying for an hour, then give up.
                    "apns-expiration": str(int(time.time()) + 3600),
                },
            )
    except (httpx.HTTPError, ValueError, jwt.PyJWTError) as exc:
        return PushResult(ok=False, error=f"APNs request failed: {exc}"[:500])

    if response.status_code == 200:
        return PushResult(ok=True)
    try:
        reason = response.json().get("reason", "")
    except ValueError:
        reason = ""
    gone = response.status_code == 410 or reason in {"BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"}
    return PushResult(ok=False, gone=gone, error=f"APNs {response.status_code} {reason}".strip())


# -------------------------------------------------------------- Web Push


def _vapid() -> Vapid | None:
    key = _env("VAPID_PRIVATE_KEY")
    if not key:
        return None
    if "BEGIN" in key:  # a PEM file's text, possibly stored on one line
        return Vapid.from_pem(key.replace("\\n", "\n").encode())
    return Vapid.from_string(private_key=key)  # the bare base64 form


def vapid_public_key() -> str | None:
    """The key browsers need when subscribing, in the form the Push API expects."""
    vapid = _vapid()
    if vapid is None:
        return None
    raw = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def allowed_web_push_endpoint(endpoint: str) -> bool:
    parts = urlsplit(endpoint)
    host = (parts.hostname or "").lower()
    extra = tuple(h.strip().lower() for h in _env("WEB_PUSH_EXTRA_HOSTS").split(",") if h.strip())
    if host in extra:  # local testing only; never set this in production
        return True
    if parts.scheme != "https":
        return False
    return any(host == h or (h.startswith(".") and host.endswith(h)) for h in WEB_PUSH_HOSTS)


def send_web_push(endpoint: str, p256dh: str, auth: str, title: str, body: str, data: dict) -> PushResult:
    vapid = _vapid()
    if vapid is None:
        return PushResult(ok=False, error="Web Push is not configured")
    if not allowed_web_push_endpoint(endpoint):
        return PushResult(ok=False, gone=True, error="Endpoint is not a known push service")
    try:
        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
            data=json.dumps({"title": title, "body": body, **data}),
            vapid_private_key=vapid,
            vapid_claims={"sub": _env("VAPID_SUBJECT") or "mailto:admin@example.com"},
            ttl=3600,
            timeout=10,
        )
        return PushResult(ok=True)
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else None
        return PushResult(ok=False, gone=status in (404, 410), error=f"Web Push {status}: {exc}"[:500])
    except Exception as exc:  # bad keys in the subscription, network trouble
        return PushResult(ok=False, error=f"Web Push failed: {exc}"[:500])
