from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.init_db import SessionLocal
from database.schema import (
    Notification,
    NotificationProvider,
    NotificationStatus,
    NotificationSubscription,
    NotificationType,
    Order,
    OrderStatus,
    OrderStatusHistory,
    Platform,
)
from modules.qr.services import QRService, build_tracking_url
from modules.stores.services import StoreService
from . import providers
from .schemas import ApnsSubscription, PushConfig, SubscribeResponse, WebPushSubscription

# An App Clip may notify for 8 hours after it was opened; Apple enforces this.
APNS_LIFETIME = timedelta(hours=8)
WEB_PUSH_LIFETIME = timedelta(hours=24)

DEFAULT_TEXT = {
    NotificationType.ORDER_READY: {
        "tr": ("Siparişiniz hazır!", "Sipariş {number} tezgahta sizi bekliyor."),
        "en": ("Your order is ready!", "Order {number} is waiting at the counter."),
    },
    NotificationType.ORDER_CANCELLED: {
        "tr": ("Sipariş iptal edildi", "Sipariş {number} iptal edildi. Lütfen kasaya danışın."),
        "en": ("Order cancelled", "Order {number} was cancelled. Please ask at the till."),
    },
}


class NotificationService:
    def __init__(self, db: Session):
        self.db = db

    def config(self) -> PushConfig:
        return PushConfig(
            vapid_public_key=providers.vapid_public_key(),
            apns_configured=providers.apns_configured(),
        )

    def subscribe(self, token: str, body: ApnsSubscription | WebPushSubscription) -> SubscribeResponse:
        """Remember a phone or browser that wants to be told about this order."""
        try:
            _, order = QRService(self.db)._resolve(token)
            if order.status in (OrderStatus.COLLECTED, OrderStatus.CANCELLED):
                raise HTTPException(status_code=409, detail="This order is already finished")

            now = datetime.now(timezone.utc)
            table = NotificationSubscription
            if isinstance(body, ApnsSubscription):
                device_token = body.device_token.lower()
                existing = self.db.scalar(
                    select(table).where(table.order_id == order.id, table.device_token == device_token)
                )
                sub = existing or table(
                    order_id=order.id,
                    platform=Platform.IOS,
                    provider=NotificationProvider.APNS,
                    device_token=device_token,
                )
                sub.apns_environment = body.environment
                sub.expires_at = now + APNS_LIFETIME
            else:
                if not providers.allowed_web_push_endpoint(body.endpoint):
                    raise HTTPException(status_code=422, detail="Unknown push service")
                existing = self.db.scalar(
                    select(table).where(table.order_id == order.id, table.endpoint == body.endpoint)
                )
                sub = existing or table(
                    order_id=order.id,
                    platform=body.platform,
                    provider=NotificationProvider.WEB_PUSH,
                    endpoint=body.endpoint,
                )
                sub.p256dh = body.p256dh
                sub.auth_secret = body.auth
                sub.expires_at = now + WEB_PUSH_LIFETIME

            sub.is_active = True
            if existing is None:
                self.db.add(sub)
            self.db.commit()
            return SubscribeResponse(subscribed=True, expires_at=sub.expires_at)
        except Exception:
            self.db.rollback()
            raise

    def enqueue(
        self,
        order: Order,
        kind: NotificationType,
        status_event: OrderStatusHistory | None = None,
    ) -> int:
        """
        Queue one push per subscribed device, inside the caller's transaction:
        the pushes exist only if the status change itself is committed.
        Sending happens afterwards, in `deliver_for_order`.
        """
        now = datetime.now(timezone.utc)
        table = NotificationSubscription
        subs = self.db.scalars(
            select(table).where(
                table.order_id == order.id,
                table.is_active.is_(True),
                (table.expires_at.is_(None)) | (table.expires_at > now),
            )
        ).all()
        for sub in subs:
            self.db.add(
                Notification(
                    order_id=order.id,
                    subscription_id=sub.id,
                    status_event_id=status_event.id if status_event else None,
                    type=kind,
                    status=NotificationStatus.PENDING,
                )
            )
        return len(subs)


def _message(db: Session, order: Order, kind: NotificationType) -> tuple[str, str]:
    """The store's own wording when it has set one, in the store's language."""
    design = StoreService(db).get_settings(order.store_id)
    lang = design.default_language
    title, body = DEFAULT_TEXT[kind][lang]
    if kind == NotificationType.ORDER_READY:
        title = getattr(design, f"alert_title_{lang}") or title
        body = getattr(design, f"alert_text_{lang}") or body

    def fill(text: str) -> str:
        return text.replace("{number}", str(order.order_number)).replace("{venue}", design.name)

    return fill(title), fill(body)


def deliver_for_order(order_id: UUID) -> None:
    """Send this order's queued pushes. Runs after the request, in the background."""
    with SessionLocal() as db:
        pending = db.scalars(
            select(Notification)
            .where(Notification.order_id == order_id, Notification.status == NotificationStatus.PENDING)
            .order_by(Notification.created_at)
            # Two workers must never send the same push twice.
            .with_for_update(skip_locked=True)
        ).all()
        if not pending:
            return
        order = db.get(Order, order_id)
        data = {"order_number": order.order_number}
        if order.qr_code is not None:
            data["url"] = build_tracking_url(order.qr_code.token)

        for note in pending:
            sub = note.subscription
            if sub is None or not sub.is_active:
                note.status = NotificationStatus.FAILED
                note.error_message = "Subscription is no longer active"
                continue
            title, body = _message(db, order, note.type)
            if sub.provider == NotificationProvider.APNS:
                result = providers.send_apns(
                    sub.device_token, sub.apns_environment.value, title, body, data
                )
            else:
                result = providers.send_web_push(sub.endpoint, sub.p256dh, sub.auth_secret, title, body, data)

            if result.ok:
                note.status = NotificationStatus.SENT
                note.sent_at = datetime.now(timezone.utc)
            else:
                note.status = NotificationStatus.FAILED
                note.error_message = result.error
                if result.gone:
                    sub.is_active = False
        db.commit()
