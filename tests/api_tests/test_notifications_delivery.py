from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import modules.notifications.services as services
from database.schema import (
    APNsEnvironment,
    NotificationProvider,
    NotificationStatus,
    NotificationType,
)


class _ScalarRows:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class _FakeSession:
    def __init__(self, order, notes):
        self.order = order
        self.notes = notes
        self.committed = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def scalars(self, statement):
        return _ScalarRows(self.notes)

    def get(self, model, order_id):
        return self.order

    def commit(self):
        self.committed = True


def test_deliver_for_order_sends_apns_and_marks_sent(monkeypatch):
    order_id = uuid4()
    sub = SimpleNamespace(
        id=uuid4(),
        is_active=True,
        provider=NotificationProvider.APNS,
        device_token="a" * 64,
        apns_environment=APNsEnvironment.SANDBOX,
    )
    note = SimpleNamespace(
        subscription=sub,
        type=NotificationType.ORDER_READY,
        status=NotificationStatus.PENDING,
        error_message=None,
        sent_at=None,
    )
    order = SimpleNamespace(
        id=order_id,
        order_number=42,
        qr_code=SimpleNamespace(token="qr-token"),
    )
    fake_db = _FakeSession(order, [note])

    monkeypatch.setattr(services, "SessionLocal", lambda: fake_db)
    monkeypatch.setattr(services, "_message", lambda db, order, kind: ("Ready", "Come collect"))
    monkeypatch.setattr(
        services,
        "build_tracking_url",
        lambda token: f"https://example.test/track/{token}",
    )

    send = MagicMock(
        return_value=services.providers.PushResult(ok=True)
    )
    monkeypatch.setattr(services.providers, "send_apns", send)

    services.deliver_for_order(order_id)

    assert note.status == NotificationStatus.SENT
    assert note.sent_at is not None
    assert fake_db.committed is True
    send.assert_called_once()
    args = send.call_args.args
    assert args[0] == "a" * 64
    assert args[1] == "sandbox"
    assert args[2] == "Ready"
    assert args[3] == "Come collect"
    assert args[4] == {
        "order_number": 42,
        "url": "https://example.test/track/qr-token",
    }


def test_deliver_for_order_deactivates_gone_subscription(monkeypatch):
    order_id = uuid4()
    sub = SimpleNamespace(
        id=uuid4(),
        is_active=True,
        provider=NotificationProvider.WEB_PUSH,
        endpoint="https://fcm.googleapis.com/fcm/send/test",
        p256dh="p" * 32,
        auth_secret="a" * 16,
    )
    note = SimpleNamespace(
        subscription=sub,
        type=NotificationType.ORDER_READY,
        status=NotificationStatus.PENDING,
        error_message=None,
        sent_at=None,
    )
    order = SimpleNamespace(
        id=order_id,
        order_number=8,
        qr_code=None,
    )
    fake_db = _FakeSession(order, [note])

    monkeypatch.setattr(services, "SessionLocal", lambda: fake_db)
    monkeypatch.setattr(services, "_message", lambda db, order, kind: ("Ready", "Body"))
    monkeypatch.setattr(
        services.providers,
        "send_web_push",
        MagicMock(
            return_value=services.providers.PushResult(
                ok=False,
                gone=True,
                error="Gone",
            )
        ),
    )

    services.deliver_for_order(order_id)

    assert note.status == NotificationStatus.FAILED
    assert note.error_message == "Gone"
    assert sub.is_active is False
    assert fake_db.committed is True


def test_deliver_for_order_skips_inactive_subscription(monkeypatch):
    order_id = uuid4()
    sub = SimpleNamespace(
        is_active=False,
        provider=NotificationProvider.APNS,
    )
    note = SimpleNamespace(
        subscription=sub,
        type=NotificationType.ORDER_READY,
        status=NotificationStatus.PENDING,
        error_message=None,
        sent_at=None,
    )
    order = SimpleNamespace(
        id=order_id,
        order_number=1,
        qr_code=None,
    )
    fake_db = _FakeSession(order, [note])

    monkeypatch.setattr(services, "SessionLocal", lambda: fake_db)
    apns = MagicMock()
    web = MagicMock()
    monkeypatch.setattr(services.providers, "send_apns", apns)
    monkeypatch.setattr(services.providers, "send_web_push", web)

    services.deliver_for_order(order_id)

    assert note.status == NotificationStatus.FAILED
    assert note.error_message == "Subscription is no longer active"
    apns.assert_not_called()
    web.assert_not_called()
    assert fake_db.committed is True
