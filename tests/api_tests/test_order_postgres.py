import os
from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from database.schema import (
    Base,
    Order,
    OrderRating,
    OrderStatus,
    OrderStatusHistory,
    QRCode,
    Store,
)
import modules.orders.routes as order_routes
import modules.orders.services as order_services

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
def order_side_effects(monkeypatch):
    """Disable notification delivery and loyalty side effects for Orders tests."""
    monkeypatch.setattr(order_routes, "deliver_for_order", MagicMock())

    notification_instance = MagicMock()
    loyalty_instance = MagicMock()

    monkeypatch.setattr(
        order_services,
        "NotificationService",
        MagicMock(return_value=notification_instance),
    )
    monkeypatch.setattr(
        order_services,
        "LoyaltyService",
        MagicMock(return_value=loyalty_instance),
    )

    return notification_instance, loyalty_instance


@pytest.fixture
def db_client(db_session, order_side_effects):
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(order_routes.router)
    app.dependency_overrides[order_routes.get_db] = lambda: db_session

    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def saved_store(db_session):
    store = Store(name="Orders Test Store", timezone="Asia/Beirut")
    db_session.add(store)
    db_session.flush()
    return store


@pytest.fixture
def saved_order(db_session, saved_store):
    order = Order(
        store_id=saved_store.id,
        order_number=10,
        order_date=date.today(),
        status=OrderStatus.PENDING,
    )
    db_session.add(order)
    db_session.flush()
    return order


def test_create_order_persists_order_and_initial_history(
    db_client, db_session, saved_store
):
    response = db_client.post(
        "/orders/",
        json={
            "store_id": str(saved_store.id),
            "order_number": 1,
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["store_id"] == str(saved_store.id)
    assert body["order_number"] == 1
    assert body["status"] == "pending"

    order = db_session.get(Order, body["id"])
    assert order is not None

    history = db_session.scalars(
        select(OrderStatusHistory).where(
            OrderStatusHistory.order_id == order.id
        )
    ).all()
    assert len(history) == 1
    assert history[0].previous_status is None
    assert history[0].new_status == OrderStatus.PENDING


def test_create_order_missing_store_returns_404(db_client):
    response = db_client.post(
        "/orders/",
        json={"store_id": str(uuid4()), "order_number": 1},
    )

    assert response.status_code == 404


def test_duplicate_order_number_same_day_returns_409(
    db_client, saved_store
):
    payload = {
        "store_id": str(saved_store.id),
        "order_number": 25,
    }

    first = db_client.post("/orders/", json=payload)
    second = db_client.post("/orders/", json=payload)

    assert first.status_code == 201
    assert second.status_code == 409


def test_same_order_number_allowed_for_different_stores(
    db_client, db_session, saved_store
):
    other = Store(name="Second Store", timezone="Asia/Beirut")
    db_session.add(other)
    db_session.flush()

    first = db_client.post(
        "/orders/",
        json={"store_id": str(saved_store.id), "order_number": 9},
    )
    second = db_client.post(
        "/orders/",
        json={"store_id": str(other.id), "order_number": 9},
    )

    assert first.status_code == 201
    assert second.status_code == 201


def test_get_order(db_client, saved_order):
    response = db_client.get(f"/orders/{saved_order.id}")

    assert response.status_code == 200
    assert response.json()["id"] == str(saved_order.id)


def test_get_missing_order_returns_404(db_client):
    response = db_client.get(f"/orders/{uuid4()}")
    assert response.status_code == 404


def test_get_orders_is_scoped_to_store(
    db_client, db_session, saved_store, saved_order
):
    other = Store(name="Other Store", timezone="Asia/Beirut")
    db_session.add(other)
    db_session.flush()

    other_order = Order(
        store_id=other.id,
        order_number=99,
        order_date=date.today(),
        status=OrderStatus.PENDING,
    )
    db_session.add(other_order)
    db_session.flush()

    response = db_client.get(f"/orders/?store_id={saved_store.id}")

    assert response.status_code == 200
    ids = {item["id"] for item in response.json()}
    assert str(saved_order.id) in ids
    assert str(other_order.id) not in ids


def test_valid_status_flow_and_timestamps(
    db_client, db_session, saved_order
):
    preparing = db_client.patch(
        f"/orders/{saved_order.id}/status",
        json={"status": "preparing"},
    )
    assert preparing.status_code == 200

    ready = db_client.patch(
        f"/orders/{saved_order.id}/status",
        json={"status": "ready"},
    )
    assert ready.status_code == 200
    assert ready.json()["ready_at"] is not None

    collected = db_client.patch(
        f"/orders/{saved_order.id}/status",
        json={"status": "collected"},
    )
    assert collected.status_code == 200
    assert collected.json()["completed_at"] is not None

    history = db_session.scalars(
        select(OrderStatusHistory)
        .where(OrderStatusHistory.order_id == saved_order.id)
        .order_by(OrderStatusHistory.created_at, OrderStatusHistory.id)
    ).all()

    # All three transitions must be persisted. Do not rely on row order here:
    # PostgreSQL may give multiple rows the same transaction timestamp.
    assert len(history) == 3
    assert {
        (row.previous_status, row.new_status)
        for row in history
    } == {
        (OrderStatus.PENDING, OrderStatus.PREPARING),
        (OrderStatus.PREPARING, OrderStatus.READY),
        (OrderStatus.READY, OrderStatus.COLLECTED),
    }


@pytest.mark.parametrize(
    "starting,target",
    [
        (OrderStatus.PENDING, "ready"),
        (OrderStatus.PENDING, "collected"),
        (OrderStatus.PREPARING, "collected"),
        (OrderStatus.READY, "cancelled"),
        (OrderStatus.COLLECTED, "ready"),
        (OrderStatus.CANCELLED, "pending"),
    ],
)
def test_invalid_status_transitions_return_409(
    db_client, db_session, saved_order, starting, target
):
    saved_order.status = starting
    db_session.commit()

    response = db_client.patch(
        f"/orders/{saved_order.id}/status",
        json={"status": target},
    )

    assert response.status_code == 409


def test_cancel_from_pending_is_allowed(
    db_client, db_session, saved_order
):
    response = db_client.patch(
        f"/orders/{saved_order.id}/status",
        json={"status": "cancelled"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


def test_store_id_hides_other_stores_order(
    db_client, saved_order
):
    response = db_client.patch(
        f"/orders/{saved_order.id}/status?store_id={uuid4()}",
        json={"status": "preparing"},
    )

    assert response.status_code == 404


def test_ring_requires_ready_order(db_client, saved_order):
    response = db_client.post(f"/orders/{saved_order.id}/ring")
    assert response.status_code == 409


def test_ring_ready_order_sets_timestamp_and_clears_seen(
    db_client, db_session, saved_order
):
    saved_order.status = OrderStatus.READY
    saved_order.customer_seen_at = datetime.now(timezone.utc)
    db_session.commit()

    response = db_client.post(f"/orders/{saved_order.id}/ring")

    assert response.status_code == 200
    assert response.json()["ring_requested_at"] is not None
    assert response.json()["customer_seen_at"] is None


def test_ring_store_scope_returns_404_for_other_store(
    db_client, db_session, saved_order
):
    saved_order.status = OrderStatus.READY
    db_session.commit()

    response = db_client.post(
        f"/orders/{saved_order.id}/ring?store_id={uuid4()}"
    )

    assert response.status_code == 404


def test_analytics_empty_store(db_client, saved_store):
    response = db_client.get(
        f"/orders/analytics?store_id={saved_store.id}&days=7"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["days"] == 7
    assert body["orders"] == 0
    assert body["collected"] == 0
    assert body["cancelled"] == 0
    assert body["ratings"] == 0
    assert len(body["prep_by_hour"]) == 24


def test_analytics_missing_store_returns_404(db_client):
    response = db_client.get(
        f"/orders/analytics?store_id={uuid4()}&days=30"
    )

    assert response.status_code == 404


def test_analytics_counts_status_scan_coming_and_rating(
    db_client, db_session, saved_store
):
    now = datetime.now(timezone.utc)

    order = Order(
        store_id=saved_store.id,
        order_number=50,
        order_date=date.today(),
        status=OrderStatus.COLLECTED,
        created_at=now - timedelta(minutes=10),
        ready_at=now - timedelta(minutes=5),
        completed_at=now,
        customer_coming_at=now - timedelta(minutes=2),
    )
    db_session.add(order)
    db_session.flush()

    qr = QRCode(
        order_id=order.id,
        token=f"analytics-{uuid4()}",
        created_at=now - timedelta(minutes=9),
        scanned_at=now - timedelta(minutes=8),
    )
    rating = OrderRating(order_id=order.id, stars=4)
    db_session.add_all([qr, rating])
    db_session.commit()

    response = db_client.get(
        f"/orders/analytics?store_id={saved_store.id}&days=30"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["orders"] == 1
    assert body["collected"] == 1
    assert body["scanned"] == 1
    assert body["customers_coming"] == 1
    assert body["ratings"] == 1
    assert body["avg_rating"] == 4.0
    assert body["avg_prep_seconds"] == pytest.approx(300.0)
    assert body["avg_pickup_seconds"] == pytest.approx(300.0)
