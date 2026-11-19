import os
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from database.schema import Base, Order, OrderRating, OrderStatus, QRCode, Store
import modules.qr.routes as qr_routes

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
        pytest.fail("TEST_DATABASE_URL must point to a PostgreSQL test database")

    engine = create_engine(raw_url, pool_pre_ping=True)
    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def db_session(pg_engine):
    conn = pg_engine.connect()
    outer = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        conn.close()


@pytest.fixture
def app():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(qr_routes.router)
    return app


@pytest.fixture
def db_client(app, db_session):
    app.dependency_overrides[qr_routes.get_db] = lambda: db_session
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def saved_order(db_session):
    store = Store(name="QR Test Store")
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
    return order


def test_create_qr_and_get_same_active_qr(db_client, db_session, saved_order):
    a = db_client.post(f"/orders/{saved_order.id}/qr")
    b = db_client.post(f"/orders/{saved_order.id}/qr")
    assert a.status_code == b.status_code == 200
    assert a.json()["id"] == b.json()["id"]
    assert a.json()["tracking_url"] == b.json()["tracking_url"]
    assert db_session.scalar(select(QRCode).where(QRCode.order_id == saved_order.id)) is not None


def test_get_qr_for_missing_order_qr_returns_404(db_client, saved_order):
    r = db_client.get(f"/orders/{saved_order.id}/qr")
    assert r.status_code == 404


def test_rotate_changes_token_and_reactivates(db_client, db_session, saved_order):
    first = db_client.post(f"/orders/{saved_order.id}/qr")
    old_url = first.json()["tracking_url"]

    rotated = db_client.post(f"/orders/{saved_order.id}/qr/rotate")
    assert rotated.status_code == 200
    assert rotated.json()["tracking_url"] != old_url
    assert rotated.json()["revoked_at"] is None
    assert rotated.json()["scanned_at"] is None


def test_revoke_is_idempotent_and_blocks_tracking(db_client, saved_order):
    created = db_client.post(f"/orders/{saved_order.id}/qr")
    token = created.json()["tracking_url"].rsplit("/", 1)[-1]

    first = db_client.post(f"/orders/{saved_order.id}/qr/revoke")
    second = db_client.post(f"/orders/{saved_order.id}/qr/revoke")
    assert first.status_code == second.status_code == 200
    assert second.json()["is_active"] is False

    tracked = db_client.get(f"/track/{token}")
    assert tracked.status_code == 410


def test_expired_qr_cannot_be_reused_until_rotate(db_client, db_session, saved_order):
    created = db_client.post(f"/orders/{saved_order.id}/qr")
    qr = db_session.scalar(select(QRCode).where(QRCode.order_id == saved_order.id))
    qr.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()

    r = db_client.post(f"/orders/{saved_order.id}/qr")
    assert r.status_code == 409

    rotated = db_client.post(f"/orders/{saved_order.id}/qr/rotate")
    assert rotated.status_code == 200
    assert rotated.json()["is_active"] is True


@pytest.mark.parametrize("fmt,mime", [("png","image/png"), ("svg","image/svg+xml")])
def test_qr_image_generation(db_client, saved_order, fmt, mime):
    assert db_client.post(f"/orders/{saved_order.id}/qr").status_code == 200
    r = db_client.get(f"/orders/{saved_order.id}/qr/image?format={fmt}")
    assert r.status_code == 200
    assert r.headers["content-type"] == mime
    assert r.headers["cache-control"] == "no-store"
    assert len(r.content) > 20


def test_tracking_unknown_token_returns_404(db_client):
    r = db_client.get("/track/not-a-real-token")
    assert r.status_code == 404


def test_scan_sets_scanned_at_once(db_client, db_session, saved_order):
    created = db_client.post(f"/orders/{saved_order.id}/qr")
    token = created.json()["tracking_url"].rsplit("/", 1)[-1]

    first = db_client.post(f"/track/{token}/scan")
    assert first.status_code == 200
    qr = db_session.scalar(select(QRCode).where(QRCode.order_id == saved_order.id))
    first_time = qr.scanned_at
    assert first_time is not None

    second = db_client.post(f"/track/{token}/scan")
    assert second.status_code == 200
    db_session.refresh(qr)
    assert qr.scanned_at == first_time


def test_seen_only_sets_timestamp_when_ready(db_client, db_session, saved_order):
    created = db_client.post(f"/orders/{saved_order.id}/qr")
    token = created.json()["tracking_url"].rsplit("/", 1)[-1]

    pending = db_client.post(f"/track/{token}/seen")
    assert pending.status_code == 200
    db_session.refresh(saved_order)
    assert saved_order.customer_seen_at is None

    saved_order.status = OrderStatus.READY
    db_session.commit()
    ready = db_client.post(f"/track/{token}/seen")
    assert ready.status_code == 200
    db_session.refresh(saved_order)
    assert saved_order.customer_seen_at is not None


def test_coming_requires_ready_and_sets_seen(db_client, db_session, saved_order):
    created = db_client.post(f"/orders/{saved_order.id}/qr")
    token = created.json()["tracking_url"].rsplit("/", 1)[-1]

    blocked = db_client.post(f"/track/{token}/coming")
    assert blocked.status_code == 409

    saved_order.status = OrderStatus.READY
    db_session.commit()
    ok = db_client.post(f"/track/{token}/coming")
    assert ok.status_code == 200
    db_session.refresh(saved_order)
    assert saved_order.customer_coming_at is not None
    assert saved_order.customer_seen_at is not None


def test_rating_requires_collected_and_replaces_previous_rating(db_client, db_session, saved_order):
    created = db_client.post(f"/orders/{saved_order.id}/qr")
    token = created.json()["tracking_url"].rsplit("/", 1)[-1]

    blocked = db_client.post(f"/track/{token}/rating", json={"stars": 5})
    assert blocked.status_code == 409

    saved_order.status = OrderStatus.COLLECTED
    db_session.commit()

    first = db_client.post(f"/track/{token}/rating", json={"stars": 5})
    second = db_client.post(f"/track/{token}/rating", json={"stars": 3})
    assert first.status_code == second.status_code == 200
    assert second.json()["rating"] == 3

    ratings = db_session.scalars(select(OrderRating).where(OrderRating.order_id == saved_order.id)).all()
    assert len(ratings) == 1
    assert ratings[0].stars == 3


def test_missing_order_returns_404_for_management_routes(db_client):
    missing = uuid4()
    assert db_client.post(f"/orders/{missing}/qr").status_code == 404
    assert db_client.post(f"/orders/{missing}/qr/rotate").status_code == 404
    assert db_client.post(f"/orders/{missing}/qr/revoke").status_code == 404


@pytest.mark.xfail(reason="Management QR routes currently have no staff authentication", strict=True)
def test_qr_management_routes_require_auth(db_client, saved_order):
    r = db_client.post(f"/orders/{saved_order.id}/qr")
    assert r.status_code in (401, 403)
