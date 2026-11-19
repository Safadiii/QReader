import os
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from database.schema import (
    Base,
    MenuItem,
    MenuPhoto,
    MobileOrder,
    MobileOrderSettings,
    Order,
    OrderDelivery,
    OrderItem,
    OrderStatus,
    QRCode,
    Store,
    User,
    UserRole,
)
from modules.auth.passwords import hash_password

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
def db_client(db_session, mobile_routes):
    app = FastAPI()
    app.include_router(mobile_routes.router)
    app.dependency_overrides[mobile_routes.get_db] = lambda: db_session

    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


def _user(db_session, store, name, phone, role):
    user = User(
        store_id=store.id,
        name=name,
        phone=phone,
        role=role,
        is_active=True,
        password_hash=hash_password("password123"),
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture
def mobile_data(db_session):
    store = Store(
        name="Mobile Test Store",
        timezone="Asia/Beirut",
    )
    db_session.add(store)
    db_session.flush()

    owner = _user(
        db_session,
        store,
        "Owner",
        "+9613555301",
        UserRole.OWNER,
    )
    manager = _user(
        db_session,
        store,
        "Manager",
        "+9613555302",
        UserRole.MANAGER,
    )
    staff = _user(
        db_session,
        store,
        "Staff",
        "+9613555303",
        UserRole.STAFF,
    )

    order = Order(
        store_id=store.id,
        order_number=10,
        order_date=date.today(),
        status=OrderStatus.PENDING,
    )
    db_session.add(order)
    db_session.flush()

    qr = QRCode(
        order_id=order.id,
        token="mobile-test-token",
        created_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db_session.add(qr)
    db_session.commit()

    return {
        "store": store,
        "owner": owner,
        "manager": manager,
        "staff": staff,
        "order": order,
        "qr": qr,
    }


def _enable_mobile(db_client, data, **overrides):
    payload = {
        "enabled": True,
        "collect_enabled": True,
        "car_enabled": True,
        "table_enabled": True,
        "table_count": 20,
        "hours_mode": "always",
        "opens": "08:00",
        "closes": "22:00",
    }
    payload.update(overrides)
    return db_client.put(
        f"/stores/{data['store'].id}/mobile-orders"
        f"?actor_id={data['manager'].id}",
        json=payload,
    )


def _save_menu(db_client, data, *, available=True):
    response = db_client.put(
        f"/stores/{data['store'].id}/menu"
        f"?actor_id={data['manager'].id}",
        json={
            "enabled": True,
            "currency": "₺",
            "note": " Fresh today ",
            "items": [
                {
                    "category": " Coffee ",
                    "name": " Latte ",
                    "description": " Milk coffee ",
                    "price_cents": 25000,
                    "available": available,
                }
            ],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_default_mobile_settings(
    db_client,
    mobile_data,
):
    data = mobile_data
    response = db_client.get(
        f"/stores/{data['store'].id}/mobile-orders"
        f"?actor_id={data['staff'].id}"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["collect_enabled"] is True
    assert body["car_enabled"] is False
    assert body["table_enabled"] is False
    assert body["hours_mode"] == "always"


def test_manager_saves_mobile_settings_and_staff_reads_them(
    db_client,
    db_session,
    mobile_data,
):
    data = mobile_data
    saved = _enable_mobile(
        db_client,
        data,
        car_enabled=False,
        table_count=8,
    )

    assert saved.status_code == 200
    assert saved.json()["car_enabled"] is False
    assert saved.json()["table_count"] == 8

    db_session.expire_all()
    row = db_session.get(MobileOrderSettings, data["store"].id)
    assert row is not None
    assert row.enabled is True
    assert row.table_count == 8

    read = db_client.get(
        f"/stores/{data['store'].id}/mobile-orders"
        f"?actor_id={data['staff'].id}"
    )
    assert read.status_code == 200
    assert read.json()["table_count"] == 8


def test_staff_cannot_change_mobile_settings(
    db_client,
    mobile_data,
):
    data = mobile_data
    response = db_client.put(
        f"/stores/{data['store'].id}/mobile-orders"
        f"?actor_id={data['staff'].id}",
        json={
            "enabled": True,
            "collect_enabled": True,
            "car_enabled": False,
            "table_enabled": False,
            "table_count": 0,
            "hours_mode": "always",
            "opens": "08:00",
            "closes": "22:00",
        },
    )

    assert response.status_code == 403


def test_public_delivery_state_and_collect_choice(
    db_client,
    db_session,
    mobile_data,
):
    data = mobile_data
    assert _enable_mobile(db_client, data).status_code == 200

    state = db_client.get(
        f"/track/{data['qr'].token}/delivery"
    )
    assert state.status_code == 200
    assert state.json()["available"] is True
    assert state.json()["collect"] is True

    chosen = db_client.post(
        f"/track/{data['qr'].token}/delivery",
        json={"mode": "collect"},
    )
    assert chosen.status_code == 200
    assert chosen.json()["mode"] == "collect"

    db_session.expire_all()
    row = db_session.get(OrderDelivery, data["order"].id)
    assert row is not None
    assert row.mode == "collect"


def test_car_delivery_normalizes_plate_and_details(
    db_client,
    db_session,
    mobile_data,
):
    data = mobile_data
    assert _enable_mobile(db_client, data).status_code == 200

    response = db_client.post(
        f"/track/{data['qr'].token}/delivery",
        json={
            "mode": "car",
            "car_plate": "34 abc 123",
            "car_note": "  near   entrance ",
            "car_color": " BLACK ",
            "car_model": "  VW   Golf ",
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["car_plate"] == "34ABC123"
    assert body["car_note"] == "near entrance"
    assert body["car_color"] == "black"
    assert body["car_model"] == "VW Golf"

    db_session.expire_all()
    row = db_session.get(OrderDelivery, data["order"].id)
    assert row.car_plate == "34ABC123"


def test_invalid_car_plate_returns_422(
    db_client,
    mobile_data,
):
    data = mobile_data
    assert _enable_mobile(db_client, data).status_code == 200

    response = db_client.post(
        f"/track/{data['qr'].token}/delivery",
        json={
            "mode": "car",
            "car_plate": "BAD",
        },
    )

    assert response.status_code == 422


def test_table_delivery_requires_label(
    db_client,
    mobile_data,
):
    data = mobile_data
    assert _enable_mobile(db_client, data).status_code == 200

    response = db_client.post(
        f"/track/{data['qr'].token}/delivery",
        json={"mode": "table", "table_label": "   "},
    )

    assert response.status_code == 422


def test_finished_order_cannot_choose_delivery(
    db_client,
    db_session,
    mobile_data,
):
    data = mobile_data
    assert _enable_mobile(db_client, data).status_code == 200
    data["order"].status = OrderStatus.COLLECTED
    db_session.commit()

    response = db_client.post(
        f"/track/{data['qr'].token}/delivery",
        json={"mode": "collect"},
    )

    assert response.status_code == 409


def test_manager_saves_menu_and_public_menu_reads_it(
    db_client,
    db_session,
    mobile_data,
):
    data = mobile_data
    assert _enable_mobile(db_client, data).status_code == 200
    menu = _save_menu(db_client, data)

    assert menu["enabled"] is True
    assert menu["currency"] == "₺"
    assert menu["note"] == "Fresh today"
    assert menu["items"][0]["category"] == "Coffee"
    assert menu["items"][0]["name"] == "Latte"
    assert menu["items"][0]["description"] == "Milk coffee"

    public = db_client.get(
        f"/stores/{data['store'].id}/menu/public"
    )
    assert public.status_code == 200
    assert public.json()["ordering"]["available"] is True
    assert public.json()["items"][0]["name"] == "Latte"

    item_id = menu["items"][0]["id"]
    item = db_session.get(MenuItem, item_id)
    assert item.position == 0
    assert item.name == "Latte"


def test_staff_can_read_but_cannot_save_menu(
    db_client,
    mobile_data,
):
    data = mobile_data

    read = db_client.get(
        f"/stores/{data['store'].id}/menu"
        f"?actor_id={data['staff'].id}"
    )
    assert read.status_code == 200

    write = db_client.put(
        f"/stores/{data['store'].id}/menu"
        f"?actor_id={data['staff'].id}",
        json={
            "enabled": False,
            "currency": "₺",
            "note": "",
            "items": [],
        },
    )
    assert write.status_code == 403


def test_place_order_uses_server_menu_price(
    db_client,
    db_session,
    mobile_data,
):
    data = mobile_data
    assert _enable_mobile(db_client, data).status_code == 200
    menu = _save_menu(db_client, data)
    item_id = menu["items"][0]["id"]

    response = db_client.post(
        f"/stores/{data['store'].id}/menu/order",
        json={
            "mode": "collect",
            "customer_name": "  Abed  ",
            "note": "  No   sugar ",
            "lines": [
                {"item_id": item_id, "qty": 2},
            ],
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["order_number"] >= 1001
    assert body["total_cents"] == 50000
    assert body["token"]

    mobile = db_session.scalar(
        select(MobileOrder).where(
            MobileOrder.store_id == data["store"].id
        )
    )
    assert mobile is not None
    assert mobile.customer_name == "Abed"
    assert mobile.note == "No sugar"
    assert mobile.total_cents == 50000

    delivery = db_session.get(OrderDelivery, mobile.order_id)
    assert delivery.mode == "collect"

    lines = db_session.scalars(
        select(OrderItem).where(
            OrderItem.order_id == mobile.order_id
        )
    ).all()
    assert len(lines) == 1
    assert lines[0].name == "Latte"
    assert lines[0].qty == 2
    assert lines[0].unit_cents == 25000


def test_unavailable_menu_item_cannot_be_ordered(
    db_client,
    mobile_data,
):
    data = mobile_data
    assert _enable_mobile(db_client, data).status_code == 200
    menu = _save_menu(db_client, data, available=False)

    response = db_client.post(
        f"/stores/{data['store'].id}/menu/order",
        json={
            "mode": "collect",
            "lines": [
                {"item_id": menu["items"][0]["id"], "qty": 1}
            ],
        },
    )

    assert response.status_code == 409


def test_menu_photo_lifecycle(
    db_client,
    mobile_data,
):
    data = mobile_data
    menu = _save_menu(db_client, data)
    item_id = menu["items"][0]["id"]
    photo = b"\x89PNG\r\n\x1a\nsample-photo"

    upload = db_client.put(
        f"/stores/{data['store'].id}/menu/items/{item_id}/photo"
        f"?actor_id={data['manager'].id}",
        content=photo,
    )
    assert upload.status_code == 200
    assert upload.json()["items"][0]["has_photo"] is True

    fetched = db_client.get(
        f"/stores/{data['store'].id}/menu/items/{item_id}/photo"
    )
    assert fetched.status_code == 200
    assert fetched.content == photo
    assert fetched.headers["content-type"] == "image/png"
    assert fetched.headers["cache-control"] == "public, max-age=300"

    deleted = db_client.delete(
        f"/stores/{data['store'].id}/menu/items/{item_id}/photo"
        f"?actor_id={data['manager'].id}"
    )
    assert deleted.status_code == 200
    assert deleted.json()["items"][0]["has_photo"] is False
    assert db_client.get(
        f"/stores/{data['store'].id}/menu/items/{item_id}/photo"
    ).status_code == 404


def test_photo_rejects_unsupported_and_oversized_files(
    db_client,
    mobile_data,
):
    data = mobile_data
    menu = _save_menu(db_client, data)
    item_id = menu["items"][0]["id"]
    url = (
        f"/stores/{data['store'].id}/menu/items/{item_id}/photo"
        f"?actor_id={data['manager'].id}"
    )

    bad = db_client.put(url, content=b"not-an-image")
    assert bad.status_code == 415

    too_large = db_client.put(
        url,
        content=b"\x89PNG\r\n\x1a\n" + b"x" * (1024 * 1024),
    )
    assert too_large.status_code == 413


def test_car_page_and_new_car_order(
    db_client,
    db_session,
    mobile_data,
):
    data = mobile_data
    assert _enable_mobile(db_client, data).status_code == 200

    page = db_client.get(
        f"/stores/{data['store'].id}/car/public"
    )
    assert page.status_code == 200
    assert page.json()["available"] is True

    order = db_client.post(
        f"/stores/{data['store'].id}/car/order",
        json={
            "what": "  Two   coffees ",
            "customer_name": "  Driver ",
            "car_plate": "34 abc 123",
            "car_color": " Black ",
        },
    )
    assert order.status_code == 200, order.text
    assert order.json()["order_number"] >= 1001
    assert order.json()["token"]

    mobile = db_session.scalar(
        select(MobileOrder)
        .where(MobileOrder.store_id == data["store"].id)
        .order_by(MobileOrder.order_id.desc())
    )
    assert mobile is not None
    assert mobile.note == "Two coffees"
    assert mobile.customer_name == "Driver"


def test_deliveries_include_phone_order_details(
    db_client,
    mobile_data,
):
    data = mobile_data
    assert _enable_mobile(db_client, data).status_code == 200
    menu = _save_menu(db_client, data)

    placed = db_client.post(
        f"/stores/{data['store'].id}/menu/order",
        json={
            "mode": "collect",
            "customer_name": "Abed",
            "note": "No sugar",
            "lines": [
                {"item_id": menu["items"][0]["id"], "qty": 1}
            ],
        },
    )
    assert placed.status_code == 200

    deliveries = db_client.get(
        f"/stores/{data['store'].id}/deliveries"
        f"?actor_id={data['staff'].id}"
    )

    assert deliveries.status_code == 200
    items = deliveries.json()["items"]
    assert len(items) >= 1
    phone_items = [item for item in items if item["phone_order"]]
    assert phone_items
    assert phone_items[0]["customer_name"] == "Abed"
    assert phone_items[0]["total_cents"] == 25000
    assert phone_items[0]["lines"][0] == {
        "name": "Latte",
        "qty": 1,
    }
