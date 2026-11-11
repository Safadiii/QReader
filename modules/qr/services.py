import os
import secrets
from datetime import datetime, timedelta, timezone
from io import BytesIO
from urllib.parse import quote, urlsplit
from uuid import UUID

import qrcode as qrr
from dotenv import load_dotenv
from fastapi import HTTPException, status
from qrcode.image.svg import SvgPathFillImage
from sqlalchemy.orm import Session

from database.schema import Order, OrderStatus, QRCode
from .repository import QRRepository
from .schemas import PublicOrderResponse, QRCodeResponse

load_dotenv()

def tracking_base_url() -> str:
    base = os.getenv("TRACKING_BASE_URL", "http://localhost:3000/track").rstrip("/")
    parts = urlsplit(base)

    if parts.scheme not in {"http", "https"} or not parts.hostname or parts.query or parts.fragment:
        raise RuntimeError("TRACKING_BASE_URL must be an absolute HTTP(S) URL without query/fragment")
    
    if parts.scheme != "https" and parts.hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Use HTTPS for non-local TRACKING_BASE_URL values")
    
    return base

def qr_ttl() -> timedelta:
    try: 
        minutes = int(os.getenv("QR_TTL_MINUTES", "1440"))
    except ValueError as exc:
        raise RuntimeError("QR_TTL_MINUTES must be a positive integer") from exc
    if not 1 <= minutes <= 525600:
        raise RuntimeError("R_TTL_MINUTES must be between 1 and 525600")
    return timedelta(minutes=minutes)


def build_tracking_url(token: str) -> str:
    return f"{tracking_base_url()}/{quote(token, safe='')}"

def is_active(qr: QRCode, now: datetime | None = None) -> bool:
    now = now or datetime.now(timezone.utc)
    return qr.revoked_at is None and (qr.expires_at is None or qr.expires_at > now)

def make_qr_image(url: str, image_format: str) -> bytes:
    """Generate image bytes in memory; do not save QR images in PostgreSQL."""
    qr = qrr.QRCode(
        error_correction=qrr.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    output = BytesIO()
    if image_format == "png":
        image = qr.make_image(fill_color="black", back_color="white")
        image.save(output, format="PNG")
    elif image_format == "svg":
        image = qr.make_image(image_factory=SvgPathFillImage)
        output.write(image.to_string())
    else:
        raise ValueError("image_format must be 'png' or 'svg'")
    return output.getvalue()

class QRService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = QRRepository(db)

    @staticmethod
    def _not_found() -> HTTPException:
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="QR code not found")

    @staticmethod
    def _response(qr: QRCode) -> QRCodeResponse:
        return QRCodeResponse(
            id=qr.id,
            order_id=qr.order_id,
            tracking_url=build_tracking_url(qr.token),
            created_at=qr.created_at,
            expires_at=qr.expires_at,
            revoked_at=qr.revoked_at,
            scanned_at=qr.scanned_at,
            is_active=is_active(qr),
        )

    def create_or_get(self, order_id: UUID) -> QRCodeResponse:
        """Idempotent for an active QR. Rotate explicitly to reissue an inactive QR."""
        try:
            order = self.repository.lock_order(order_id)
            if order is None:
                raise HTTPException(status_code=404, detail="Order not found")

            existing = self.repository.get_by_order_id(order_id)
            if existing is not None:
                if not is_active(existing):
                    raise HTTPException(
                        status_code=409,
                        detail="QR is expired or revoked; rotate it to issue a new link",
                    )
                # Release the FOR UPDATE lock without making any changes.
                result = self._response(existing)
                self.db.rollback()
                return result

            now = datetime.now(timezone.utc)
            qr = QRCode(
                order_id=order.id,
                token=secrets.token_urlsafe(32),
                created_at=now,
                expires_at=now + qr_ttl(),
            )
            self.repository.add(qr)
            self.db.commit()
            return self._response(qr)
        except Exception:
            self.db.rollback()
            raise

    def get_by_order(self, order_id: UUID) -> QRCodeResponse:
        qr = self.repository.get_by_order_id(order_id)
        if qr is None:
            raise self._not_found()
        return self._response(qr)

    def get_image(self, order_id: UUID, image_format: str) -> bytes:
        qr = self.repository.get_by_order_id(order_id)
        if qr is None:
            raise self._not_found()
        if not is_active(qr):
            raise HTTPException(status_code=410, detail="QR code is no longer active")
        return make_qr_image(build_tracking_url(qr.token), image_format)

    def rotate(self, order_id: UUID) -> QRCodeResponse:
        """Issue a new token, immediately invalidating the previous tracking URL."""
        try:
            order = self.repository.lock_order(order_id)
            if order is None:
                raise HTTPException(status_code=404, detail="Order not found")

            now = datetime.now(timezone.utc)
            qr = self.repository.get_by_order_id(order_id)
            if qr is None:
                qr = QRCode(order_id=order.id)
                self.db.add(qr)

            qr.token = secrets.token_urlsafe(32)
            qr.created_at = now
            qr.expires_at = now + qr_ttl()
            qr.revoked_at = None
            qr.scanned_at = None
            self.db.flush()
            self.db.commit()
            return self._response(qr)
        except Exception:
            self.db.rollback()
            raise

    def revoke(self, order_id: UUID) -> QRCodeResponse:
        try:
            order = self.repository.lock_order(order_id)
            if order is None:
                raise HTTPException(status_code=404, detail="Order not found")
            qr = self.repository.get_by_order_id(order_id)
            if qr is None:
                raise self._not_found()
            if qr.revoked_at is None:
                qr.revoked_at = datetime.now(timezone.utc)
                self.db.commit()
            else:
                self.db.rollback()
            return self._response(qr)
        except Exception:
            self.db.rollback()
            raise

    def _resolve(self, token: str) -> tuple[QRCode, Order]:
        """Find the active QR and its order for a public token, or raise 404/410."""
        # Limit excessively long untrusted path parameters without a DB lookup.
        if len(token) > 128 or not token:
            raise self._not_found()
        qr = self.repository.get_by_token(token)
        if qr is None:
            raise self._not_found()
        if not is_active(qr):
            raise HTTPException(status_code=410, detail="Tracking link is expired or revoked")
        order = self.repository.get_order(qr.order_id)
        if order is None:
            raise self._not_found()
        return qr, order

    @staticmethod
    def _public(order: Order) -> PublicOrderResponse:
        return PublicOrderResponse(
            store_name=order.store.name,
            order_number=order.order_number,
            status=order.status,
            ready_at=order.ready_at,
            customer_coming_at=order.customer_coming_at,
        )

    def track(self, token: str) -> PublicOrderResponse:
        _, order = self._resolve(token)
        return self._public(order)

    def scan(self, token: str) -> PublicOrderResponse:
        """Record the first time a customer opens the link. Safe to call again."""
        try:
            qr, order = self._resolve(token)
            if qr.scanned_at is None:
                qr.scanned_at = datetime.now(timezone.utc)
                self.db.commit()
            return self._public(order)
        except Exception:
            self.db.rollback()
            raise

    def coming(self, token: str) -> PublicOrderResponse:
        """Record that the customer is on their way. Only valid once the order is ready."""
        try:
            qr, _ = self._resolve(token)
            order = self.repository.lock_order(qr.order_id)
            if order is None:
                raise self._not_found()
            if order.status != OrderStatus.READY:
                raise HTTPException(status_code=409, detail="Order is not ready for collection")
            if order.customer_coming_at is None:
                order.customer_coming_at = datetime.now(timezone.utc)
                self.db.commit()
            else:
                self.db.rollback()
            return self._public(order)
        except Exception:
            self.db.rollback()
            raise
