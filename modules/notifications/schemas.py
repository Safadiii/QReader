from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from database.schema import APNsEnvironment, Platform


class ApnsSubscription(BaseModel):
    """An iPhone (App Clip or app) that Apple will deliver pushes to."""
    provider: Literal["apns"]
    # The device token from iOS, as hex.
    device_token: str = Field(pattern=r"^[0-9a-fA-F]{64,200}$")
    # "sandbox" for builds run from Xcode, "production" for TestFlight and the App Store.
    environment: APNsEnvironment


class WebPushSubscription(BaseModel):
    """A browser's push subscription (Android Chrome, desktop browsers)."""
    provider: Literal["web_push"]
    endpoint: str = Field(max_length=2000)
    p256dh: str = Field(min_length=20, max_length=200)
    auth: str = Field(min_length=10, max_length=100)
    platform: Platform = Platform.ANDROID


SubscribeBody = Annotated[Union[ApnsSubscription, WebPushSubscription], Field(discriminator="provider")]


class SubscribeResponse(BaseModel):
    subscribed: bool
    expires_at: datetime | None


class PushConfig(BaseModel):
    # Browsers need this to create a push subscription. None until VAPID keys are set.
    vapid_public_key: str | None
    apns_configured: bool
