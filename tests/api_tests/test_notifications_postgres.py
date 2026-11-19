import os
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from database.schema import (
    APNsEnvironment,
    Base,
    Notification,
    NotificationProvider,
    NotificationStatus,
    NotificationSubscription,
    NotificationType,
    Order,
    OrderStatus,
    OrderStatusHistory,
    Platform,
    QRCode,
    Store,
)
import modules.notifications.routes as notification_routes
import modules.notifications.services as notification_services

pytestmark = pytest.mark.integration


@pytest.fixture(scope="session")
def pg_engine():
    raw_url = os.getenv("TEST_DATABASE_URL")
    if not raw_url:
        pytest.skip("Set TEST_DATABASE_URL for PostgreSQL integration tests")

    url = make_url(raw_url)
    db_name = url.database or ""
    if url.get_backend_name() != "postgresql" or not (
        db_name.endswith("_test") or db_name.startswith("test_")
    ):
        pytest.fail(
            "TEST_DATABASE_URL must point to PostgreSQL and a database "
            "whose name ends with '_test' or starts with 'test_'."
        )

    engine = create_engine(raw_url, pool_pre_ping=True)
    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def db_session(pg_engine):
    connection = pg_engine.connect()
    outer = connection.begin()
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
    )
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()


@pytest.fixture
def db_client(db_session):
    app = FastAPI()
    app.include_router(notification_routes.router)
    app.dependency_overrides[notification_routes.get_db] = lambda: db_session

    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def notification_order(db_session):
    store = Store(
        name="Notifications Test Store",
        timezone="Asia/Beirut",
    )
    db_session.add(store)
    db_session.flush()

    order = Order(
        store_id=store.id,
        order_number=1,
        order_date=date.today(),
        status=OrderStatus.PENDING,
    )
    db_session.add(order)
    db_session.flush()

    token = f"notify-{uuid4()}"
    qr = QRCode(
        order_id=order.id,
        token=token,
        created_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db_session.add(qr)
    db_session.flush()

    return store, order, qr


def test_apns_subscription_persists(
    db_client,
    db_session,
    notification_order,
):
    _, order, qr = notification_order
    before = datetime.now(timezone.utc)

    response = db_client.post(
        f"/track/{qr.token}/subscribe",
        json={
            "provider": "apns",
            "device_token": "A" * 64,
            "environment": "sandbox",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["subscribed"] is True

    sub = db_session.scalar(
        select(NotificationSubscription).where(
            NotificationSubscription.order_id == order.id,
            NotificationSubscription.device_token == "a" * 64,
        )
    )
    assert sub is not None
    assert sub.provider == NotificationProvider.APNS
    assert sub.platform == Platform.IOS
    assert sub.apns_environment == APNsEnvironment.SANDBOX
    assert sub.is_active is True
    assert sub.expires_at >= before + timedelta(hours=7, minutes=59)


def test_web_push_subscription_persists(
    db_client,
    db_session,
    notification_order,
):
    _, order, qr = notification_order
    endpoint = "https://fcm.googleapis.com/fcm/send/test-notification"

    response = db_client.post(
        f"/track/{qr.token}/subscribe",
        json={
            "provider": "web_push",
            "endpoint": endpoint,
            "p256dh": "p" * 32,
            "auth": "a" * 16,
            "platform": "android",
        },
    )

    assert response.status_code == 200, response.text

    sub = db_session.scalar(
        select(NotificationSubscription).where(
            NotificationSubscription.order_id == order.id,
            NotificationSubscription.endpoint == endpoint,
        )
    )
    assert sub is not None
    assert sub.provider == NotificationProvider.WEB_PUSH
    assert sub.platform == Platform.ANDROID
    assert sub.p256dh == "p" * 32
    assert sub.auth_secret == "a" * 16
    assert sub.expires_at > datetime.now(timezone.utc) + timedelta(hours=23)


def test_apns_resubscribe_updates_existing_row(
    db_client,
    db_session,
    notification_order,
):
    _, order, qr = notification_order
    token = "b" * 64

    first = db_client.post(
        f"/track/{qr.token}/subscribe",
        json={
            "provider": "apns",
            "device_token": token.upper(),
            "environment": "sandbox",
        },
    )
    assert first.status_code == 200

    sub = db_session.scalar(
        select(NotificationSubscription).where(
            NotificationSubscription.order_id == order.id,
            NotificationSubscription.device_token == token,
        )
    )
    original_id = sub.id
    sub.is_active = False
    db_session.commit()

    second = db_client.post(
        f"/track/{qr.token}/subscribe",
        json={
            "provider": "apns",
            "device_token": token,
            "environment": "production",
        },
    )
    assert second.status_code == 200

    rows = db_session.scalars(
        select(NotificationSubscription).where(
            NotificationSubscription.order_id == order.id,
            NotificationSubscription.device_token == token,
        )
    ).all()

    assert len(rows) == 1
    assert rows[0].id == original_id
    assert rows[0].is_active is True
    assert rows[0].apns_environment == APNsEnvironment.PRODUCTION


def test_web_push_resubscribe_updates_keys_without_duplicate(
    db_client,
    db_session,
    notification_order,
):
    _, order, qr = notification_order
    endpoint = "https://fcm.googleapis.com/fcm/send/resubscribe"

    payload = {
        "provider": "web_push",
        "endpoint": endpoint,
        "p256dh": "p" * 32,
        "auth": "a" * 16,
        "platform": "android",
    }
    assert db_client.post(
        f"/track/{qr.token}/subscribe",
        json=payload,
    ).status_code == 200

    payload["p256dh"] = "q" * 32
    payload["auth"] = "b" * 16
    assert db_client.post(
        f"/track/{qr.token}/subscribe",
        json=payload,
    ).status_code == 200

    rows = db_session.scalars(
        select(NotificationSubscription).where(
            NotificationSubscription.order_id == order.id,
            NotificationSubscription.endpoint == endpoint,
        )
    ).all()

    assert len(rows) == 1
    assert rows[0].p256dh == "q" * 32
    assert rows[0].auth_secret == "b" * 16


def test_unknown_tracking_token_returns_404(db_client):
    response = db_client.post(
        "/track/not-a-real-token/subscribe",
        json={
            "provider": "apns",
            "device_token": "a" * 64,
            "environment": "sandbox",
        },
    )

    assert response.status_code == 404


@pytest.mark.parametrize(
    "status",
    [OrderStatus.COLLECTED, OrderStatus.CANCELLED],
)
def test_finished_order_cannot_subscribe(
    db_client,
    db_session,
    notification_order,
    status,
):
    _, order, qr = notification_order
    order.status = status
    db_session.commit()

    response = db_client.post(
        f"/track/{qr.token}/subscribe",
        json={
            "provider": "apns",
            "device_token": "c" * 64,
            "environment": "sandbox",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "This order is already finished"


def test_unknown_web_push_service_returns_422(
    db_client,
    notification_order,
):
    _, _, qr = notification_order

    response = db_client.post(
        f"/track/{qr.token}/subscribe",
        json={
            "provider": "web_push",
            "endpoint": "https://example.com/push",
            "p256dh": "p" * 32,
            "auth": "a" * 16,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Unknown push service"


def test_expired_qr_cannot_subscribe(
    db_client,
    db_session,
    notification_order,
):
    _, _, qr = notification_order
    qr.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()

    response = db_client.post(
        f"/track/{qr.token}/subscribe",
        json={
            "provider": "apns",
            "device_token": "d" * 64,
            "environment": "sandbox",
        },
    )

    assert response.status_code == 410


def test_enqueue_creates_pending_notification_for_active_subscription_only(
    db_session,
    notification_order,
):
    _, order, _ = notification_order
    now = datetime.now(timezone.utc)

    active = NotificationSubscription(
        order_id=order.id,
        platform=Platform.IOS,
        provider=NotificationProvider.APNS,
        device_token="1" * 64,
        apns_environment=APNsEnvironment.SANDBOX,
        is_active=True,
        expires_at=now + timedelta(hours=1),
    )
    expired = NotificationSubscription(
        order_id=order.id,
        platform=Platform.IOS,
        provider=NotificationProvider.APNS,
        device_token="2" * 64,
        apns_environment=APNsEnvironment.SANDBOX,
        is_active=True,
        expires_at=now - timedelta(seconds=1),
    )
    inactive = NotificationSubscription(
        order_id=order.id,
        platform=Platform.ANDROID,
        provider=NotificationProvider.WEB_PUSH,
        endpoint="https://fcm.googleapis.com/fcm/send/inactive",
        p256dh="p" * 32,
        auth_secret="a" * 16,
        is_active=False,
        expires_at=now + timedelta(hours=1),
    )
    db_session.add_all([active, expired, inactive])
    db_session.flush()

    history = OrderStatusHistory(
        order_id=order.id,
        previous_status=OrderStatus.PREPARING,
        new_status=OrderStatus.READY,
    )
    db_session.add(history)
    db_session.flush()

    count = notification_services.NotificationService(db_session).enqueue(
        order,
        NotificationType.ORDER_READY,
        history,
    )
    db_session.flush()

    notes = db_session.scalars(
        select(Notification).where(Notification.order_id == order.id)
    ).all()

    assert count == 1
    assert len(notes) == 1
    assert notes[0].subscription_id == active.id
    assert notes[0].status_event_id == history.id
    assert notes[0].type == NotificationType.ORDER_READY
    assert notes[0].status == NotificationStatus.PENDING
