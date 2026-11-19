"""Complete Loyalty test suite: routes, validation, helpers, service, and PostgreSQL."""

import os
import re
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import ANY
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from database.schema import (
    Base,
    LoyaltyCard,
    LoyaltyIdentity,
    LoyaltyProgram,
    LoyaltyRedemption,
    LoyaltyStamp,
    Order,
    OrderStatus,
    QRCode,
    Store,
    User,
    UserRole,
)
from modules.auth.passwords import hash_password


# ===========================================================================
# Route + request validation tests
# ===========================================================================


def test_claim_stamp_route(
    loyalty_client,
    loyalty_service,
    loyalty_qr_service,
    loyalty_card_state,
):
    order = SimpleNamespace(id=uuid4(), store_id=uuid4())
    loyalty_qr_service._resolve.return_value = (object(), order)
    loyalty_service.claim.return_value = loyalty_card_state

    response = loyalty_client.post(
        "/track/test-token/loyalty",
        json={"device": "device-secret-123456"},
    )

    assert response.status_code == 200
    assert response.json()["code"] == "ABCD2345"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    loyalty_qr_service._resolve.assert_called_once_with("test-token")
    loyalty_service.claim.assert_called_once_with(
        order,
        "device-secret-123456",
    )


def test_save_phone_route(
    loyalty_client,
    loyalty_service,
    loyalty_qr_service,
    loyalty_card_state,
):
    order = SimpleNamespace(id=uuid4(), store_id=uuid4())
    loyalty_qr_service._resolve.return_value = (object(), order)
    loyalty_service.save_phone.return_value = {
        **loyalty_card_state,
        "phone_saved": True,
        "phone_hint": "+96 ••• 456",
    }

    response = loyalty_client.post(
        "/track/test-token/loyalty/phone",
        json={
            "device": "device-secret-123456",
            "phone": "+9613123456",
            "pin": "1234",
        },
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    loyalty_service.save_phone.assert_called_once_with(
        order,
        "device-secret-123456",
        "+9613123456",
        "1234",
    )


def test_restore_card_route(
    loyalty_client,
    loyalty_service,
    loyalty_qr_service,
    loyalty_card_state,
):
    order = SimpleNamespace(id=uuid4(), store_id=uuid4())
    loyalty_qr_service._resolve.return_value = (object(), order)
    loyalty_service.restore.return_value = loyalty_card_state

    response = loyalty_client.post(
        "/track/test-token/loyalty/restore",
        json={
            "device": "new-device-secret",
            "code": "ABCD-2345",
        },
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    loyalty_service.restore.assert_called_once_with(
        order,
        "new-device-secret",
        "ABCD-2345",
    )


@pytest.mark.parametrize(
    "path,payload",
    [
        (
            "/track/token/loyalty",
            {"device": "short"},
        ),
        (
            "/track/token/loyalty",
            {"device": "x" * 129},
        ),
        (
            "/track/token/loyalty/phone",
            {
                "device": "device-secret-123456",
                "phone": "12345",
                "pin": "1234",
            },
        ),
        (
            "/track/token/loyalty/phone",
            {
                "device": "device-secret-123456",
                "phone": "+9613123456",
                "pin": "123",
            },
        ),
        (
            "/track/token/loyalty/phone",
            {
                "device": "device-secret-123456",
                "phone": "+9613123456",
                "pin": "12ab",
            },
        ),
        (
            "/track/token/loyalty/restore",
            {
                "device": "device-secret-123456",
                "code": "ABC",
            },
        ),
        (
            "/track/token/loyalty/restore",
            {
                "device": "device-secret-123456",
                "code": "X" * 13,
            },
        ),
    ],
)
def test_customer_loyalty_routes_reject_invalid_body(
    loyalty_client,
    loyalty_service,
    loyalty_qr_service,
    path,
    payload,
):
    response = loyalty_client.post(path, json=payload)

    assert response.status_code == 422
    loyalty_qr_service._resolve.assert_not_called()
    loyalty_service.claim.assert_not_called()
    loyalty_service.save_phone.assert_not_called()
    loyalty_service.restore.assert_not_called()


def test_customer_route_propagates_qr_error(
    loyalty_client,
    loyalty_qr_service,
):
    loyalty_qr_service._resolve.side_effect = HTTPException(
        410,
        "Tracking link is expired or revoked",
    )

    response = loyalty_client.post(
        "/track/expired/loyalty",
        json={"device": "device-secret-123456"},
    )

    assert response.status_code == 410


def test_get_program_requires_staff(
    loyalty_client,
    loyalty_service,
    loyalty_authorize,
    store_id,
    user_id,
    loyalty_program_response,
):
    loyalty_service.get_program.return_value = loyalty_program_response

    response = loyalty_client.get(
        f"/stores/{store_id}/loyalty?actor_id={user_id}"
    )

    assert response.status_code == 200
    loyalty_authorize.assert_called_once_with(
        ANY,
        store_id,
        user_id,
        UserRole.STAFF,
    )
    loyalty_service.get_program.assert_called_once_with(store_id)


def test_save_program_requires_manager(
    loyalty_client,
    loyalty_service,
    loyalty_authorize,
    store_id,
    user_id,
    loyalty_program_response,
):
    loyalty_service.save_program.return_value = {
        **loyalty_program_response,
        "stamps_required": 7,
        "reward_name": "Free Latte",
    }

    response = loyalty_client.put(
        f"/stores/{store_id}/loyalty?actor_id={user_id}",
        json={
            "enabled": True,
            "stamps_required": 7,
            "reward_name": "  Free   Latte  ",
        },
    )

    assert response.status_code == 200
    loyalty_authorize.assert_called_once_with(
        ANY,
        store_id,
        user_id,
        UserRole.MANAGER,
    )
    actual_store, body = loyalty_service.save_program.call_args.args
    assert actual_store == store_id
    assert body.stamps_required == 7
    assert body.reward_name == "Free Latte"


@pytest.mark.parametrize("stamps", [2, 31, 0, 100])
def test_save_program_rejects_invalid_stamp_goal(
    loyalty_client,
    loyalty_service,
    store_id,
    user_id,
    stamps,
):
    response = loyalty_client.put(
        f"/stores/{store_id}/loyalty?actor_id={user_id}",
        json={
            "enabled": True,
            "stamps_required": stamps,
            "reward_name": "Free coffee",
        },
    )

    assert response.status_code == 422
    loyalty_service.save_program.assert_not_called()


def test_save_program_rejects_whitespace_reward_name(
    loyalty_client,
    loyalty_service,
    store_id,
    user_id,
):
    response = loyalty_client.put(
        f"/stores/{store_id}/loyalty?actor_id={user_id}",
        json={
            "enabled": True,
            "stamps_required": 10,
            "reward_name": "    ",
        },
    )

    assert response.status_code == 422
    loyalty_service.save_program.assert_not_called()


def test_stats_requires_manager(
    loyalty_client,
    loyalty_service,
    loyalty_authorize,
    store_id,
    user_id,
    loyalty_stats_response,
):
    loyalty_service.stats.return_value = loyalty_stats_response

    response = loyalty_client.get(
        f"/stores/{store_id}/loyalty/stats?actor_id={user_id}"
    )

    assert response.status_code == 200
    loyalty_authorize.assert_called_once_with(
        ANY,
        store_id,
        user_id,
        UserRole.MANAGER,
    )
    loyalty_service.stats.assert_called_once_with(store_id)


def test_waiting_requires_staff(
    loyalty_client,
    loyalty_service,
    loyalty_authorize,
    store_id,
    user_id,
    loyalty_waiting_response,
):
    loyalty_service.waiting.return_value = loyalty_waiting_response

    response = loyalty_client.get(
        f"/stores/{store_id}/loyalty/waiting?actor_id={user_id}"
    )

    assert response.status_code == 200
    loyalty_authorize.assert_called_once_with(
        ANY,
        store_id,
        user_id,
        UserRole.STAFF,
    )
    loyalty_service.waiting.assert_called_once_with(store_id)


def test_lookup_card_requires_staff(
    loyalty_client,
    loyalty_service,
    loyalty_authorize,
    store_id,
    user_id,
    loyalty_card_state,
):
    card_id = uuid4()
    loyalty_service.lookup.return_value = {
        **loyalty_card_state,
        "card_id": str(card_id),
    }

    response = loyalty_client.get(
        f"/stores/{store_id}/loyalty/cards/ABCD2345"
        f"?actor_id={user_id}"
    )

    assert response.status_code == 200
    assert response.json()["card_id"] == str(card_id)
    loyalty_authorize.assert_called_once_with(
        ANY,
        store_id,
        user_id,
        UserRole.STAFF,
    )
    loyalty_service.lookup.assert_called_once_with(
        store_id,
        "ABCD2345",
    )


def test_redeem_by_code_passes_authorized_actor(
    loyalty_client,
    loyalty_service,
    loyalty_authorize,
    store_id,
    user_id,
    loyalty_card_state,
):
    actor = SimpleNamespace(id=user_id, role=UserRole.STAFF)
    loyalty_authorize.return_value = actor
    loyalty_service.redeem_by_code.return_value = loyalty_card_state

    response = loyalty_client.post(
        f"/stores/{store_id}/loyalty/cards/ABCD2345/redeem"
        f"?actor_id={user_id}"
    )

    assert response.status_code == 200
    loyalty_service.redeem_by_code.assert_called_once_with(
        store_id,
        "ABCD2345",
        actor,
    )


def test_redeem_for_order_passes_authorized_actor(
    loyalty_client,
    loyalty_service,
    loyalty_authorize,
    store_id,
    user_id,
    order_id,
    loyalty_card_state,
):
    actor = SimpleNamespace(id=user_id, role=UserRole.STAFF)
    loyalty_authorize.return_value = actor
    loyalty_service.redeem_for_order.return_value = loyalty_card_state

    response = loyalty_client.post(
        f"/stores/{store_id}/loyalty/orders/{order_id}/redeem"
        f"?actor_id={user_id}"
    )

    assert response.status_code == 200
    loyalty_service.redeem_for_order.assert_called_once_with(
        store_id,
        order_id,
        actor,
    )


def test_staff_routes_propagate_permission_error(
    loyalty_client,
    loyalty_authorize,
    store_id,
    user_id,
):
    loyalty_authorize.side_effect = HTTPException(
        403,
        "Your role cannot do this",
    )

    response = loyalty_client.get(
        f"/stores/{store_id}/loyalty/stats?actor_id={user_id}"
    )

    assert response.status_code == 403


def test_loyalty_routes_reject_invalid_uuids(
    loyalty_client,
    loyalty_service,
):
    valid = "00000000-0000-0000-0000-000000000001"

    invalid_store = loyalty_client.get(
        f"/stores/not-a-uuid/loyalty?actor_id={valid}"
    )
    invalid_actor = loyalty_client.get(
        f"/stores/{valid}/loyalty?actor_id=not-a-uuid"
    )
    invalid_order = loyalty_client.post(
        f"/stores/{valid}/loyalty/orders/not-a-uuid/redeem"
        f"?actor_id={valid}"
    )

    assert invalid_store.status_code == 422
    assert invalid_actor.status_code == 422
    assert invalid_order.status_code == 422
    loyalty_service.get_program.assert_not_called()
    loyalty_service.redeem_for_order.assert_not_called()


# ===========================================================================
# Schema + helper tests
# ===========================================================================


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("abcd-2345", "ABCD2345"),
        (" ab cd 23 45 ", "ABCD2345"),
        ("K7F2-9QXM", "K7F29QXM"),
    ],
)
def test_normalize_code(loyalty_services, raw, expected):
    assert loyalty_services.normalize_code(raw) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("+961 3 123 456", "+9613123456"),
        ("+90 (555) 123-4567", "+905551234567"),
    ],
)
def test_loyalty_normalize_phone(loyalty_services, raw, expected):
    assert loyalty_services.normalize_phone(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "03123456",
        "9613123456",
        "+1234567",
        "+1234567890123456",
        "",
    ],
)
def test_loyalty_normalize_phone_rejects_invalid(
    loyalty_services,
    raw,
):
    with pytest.raises(HTTPException) as exc:
        loyalty_services.normalize_phone(raw)

    assert exc.value.status_code == 422


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("+961 3 123 456", True),
        ("0555 123 4567", True),
        ("555-123-4567", True),
        ("abc", False),
        ("123", False),
    ],
)
def test_looks_like_phone(loyalty_services, raw, expected):
    assert loyalty_services._looks_like_phone(raw) is expected


def test_owner_hash_is_deterministic_and_scoped(loyalty_services):
    store_a = uuid4()
    store_b = uuid4()

    first = loyalty_services.owner_hash(store_a, "device-secret")
    second = loyalty_services.owner_hash(store_a, "device-secret")
    different_store = loyalty_services.owner_hash(
        store_b,
        "device-secret",
    )
    different_device = loyalty_services.owner_hash(
        store_a,
        "other-device",
    )

    assert first == second
    assert len(first) == 64
    assert first != different_store
    assert first != different_device


def test_new_loyalty_code_uses_safe_alphabet(loyalty_services):
    codes = {loyalty_services._new_code() for _ in range(100)}

    assert len(codes) == 100
    for code in codes:
        assert len(code) == 8
        assert re.fullmatch(r"[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}", code)
        assert not any(ch in code for ch in "0O1IL")


def test_pin_hash_round_trip(loyalty_services):
    stored = loyalty_services._hash_pin("1234")

    assert stored != "1234"
    assert loyalty_services._check_pin("1234", stored) is True
    assert loyalty_services._check_pin("4321", stored) is False


def test_program_body_normalizes_reward_name(loyalty_schemas):
    body = loyalty_schemas.ProgramBody(
        enabled=True,
        stamps_required=10,
        reward_name="  Free   Latte  ",
    )

    assert body.reward_name == "Free Latte"


@pytest.mark.parametrize("goal", [2, 31])
def test_program_body_goal_bounds(loyalty_schemas, goal):
    with pytest.raises(ValidationError):
        loyalty_schemas.ProgramBody(
            enabled=True,
            stamps_required=goal,
            reward_name="Reward",
        )


@pytest.mark.parametrize("pin", ["123", "12345", "12ab"])
def test_phone_body_requires_four_digit_pin(loyalty_schemas, pin):
    with pytest.raises(ValidationError):
        loyalty_schemas.PhoneBody(
            device="device-secret-123456",
            phone="+9613123456",
            pin=pin,
        )


# ===========================================================================
# PostgreSQL integration fixtures
# ===========================================================================


@pytest.fixture(scope="session")
def loyalty_pg_engine():
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
def loyalty_db(loyalty_pg_engine):
    connection = loyalty_pg_engine.connect()
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
def loyalty_db_client(loyalty_db, loyalty_routes):
    app = FastAPI()
    app.include_router(loyalty_routes.router)
    app.dependency_overrides[loyalty_routes.get_db] = lambda: loyalty_db

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


def _loyalty_user(
    db: Session,
    store: Store,
    *,
    name: str,
    phone: str,
    role: UserRole,
) -> User:
    user = User(
        store_id=store.id,
        name=name,
        phone=phone,
        role=role,
        is_active=True,
        password_hash=hash_password("password123"),
    )
    db.add(user)
    db.flush()
    return user


def _loyalty_order(
    db: Session,
    store: Store,
    *,
    number: int,
    status: OrderStatus = OrderStatus.PENDING,
) -> Order:
    order = Order(
        store_id=store.id,
        order_number=number,
        order_date=date.today(),
        status=status,
    )
    db.add(order)
    db.flush()
    return order


def _loyalty_qr(
    db: Session,
    order: Order,
    *,
    token: str,
) -> QRCode:
    now = datetime.now(timezone.utc)
    qr = QRCode(
        order_id=order.id,
        token=token,
        created_at=now,
        expires_at=now + timedelta(hours=1),
    )
    db.add(qr)
    db.flush()
    return qr


@pytest.fixture
def loyalty_data(loyalty_db):
    store = Store(
        name="Loyalty Test Store",
        timezone="Asia/Beirut",
    )
    loyalty_db.add(store)
    loyalty_db.flush()

    owner = _loyalty_user(
        loyalty_db,
        store,
        name="Owner",
        phone="+9613555401",
        role=UserRole.OWNER,
    )
    manager = _loyalty_user(
        loyalty_db,
        store,
        name="Manager",
        phone="+9613555402",
        role=UserRole.MANAGER,
    )
    staff = _loyalty_user(
        loyalty_db,
        store,
        name="Staff",
        phone="+9613555403",
        role=UserRole.STAFF,
    )
    order = _loyalty_order(
        loyalty_db,
        store,
        number=40,
        status=OrderStatus.PENDING,
    )
    qr = _loyalty_qr(
        loyalty_db,
        order,
        token=f"loyalty-{uuid4()}",
    )
    loyalty_db.commit()

    return {
        "store": store,
        "owner": owner,
        "manager": manager,
        "staff": staff,
        "order": order,
        "qr": qr,
    }


def _enable_loyalty(
    client: TestClient,
    data: dict,
    *,
    goal: int = 3,
    reward: str = "Free coffee",
):
    return client.put(
        f"/stores/{data['store'].id}/loyalty"
        f"?actor_id={data['manager'].id}",
        json={
            "enabled": True,
            "stamps_required": goal,
            "reward_name": reward,
        },
    )


def _make_card(
    db: Session,
    store: Store,
    *,
    device: str,
    code: str,
    loyalty_services,
) -> LoyaltyCard:
    card = LoyaltyCard(
        store_id=store.id,
        owner_hash=loyalty_services.owner_hash(store.id, device),
        code=code,
    )
    db.add(card)
    db.flush()
    return card


# ===========================================================================
# PostgreSQL integration tests
# ===========================================================================


@pytest.mark.integration
def test_default_program_and_saved_program(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
):
    data = loyalty_data

    default = loyalty_db_client.get(
        f"/stores/{data['store'].id}/loyalty"
        f"?actor_id={data['staff'].id}"
    )

    assert default.status_code == 200
    assert default.json() == {
        "store_id": str(data["store"].id),
        "enabled": False,
        "stamps_required": 10,
        "reward_name": "Free coffee",
    }

    saved = _enable_loyalty(
        loyalty_db_client,
        data,
        goal=7,
        reward="  Free   Latte  ",
    )

    assert saved.status_code == 200
    assert saved.json()["enabled"] is True
    assert saved.json()["stamps_required"] == 7
    assert saved.json()["reward_name"] == "Free Latte"

    loyalty_db.expire_all()
    row = loyalty_db.get(LoyaltyProgram, data["store"].id)
    assert row is not None
    assert row.enabled is True
    assert row.stamps_required == 7
    assert row.reward_name == "Free Latte"


@pytest.mark.integration
def test_staff_cannot_save_program(
    loyalty_db_client,
    loyalty_data,
):
    data = loyalty_data

    response = loyalty_db_client.put(
        f"/stores/{data['store'].id}/loyalty"
        f"?actor_id={data['staff'].id}",
        json={
            "enabled": True,
            "stamps_required": 3,
            "reward_name": "Reward",
        },
    )

    assert response.status_code == 403


@pytest.mark.integration
def test_claim_pending_order_creates_card_and_one_pending_stamp(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
    loyalty_services,
):
    data = loyalty_data
    assert _enable_loyalty(loyalty_db_client, data).status_code == 200

    payload = {"device": "pending-device-secret"}
    first = loyalty_db_client.post(
        f"/track/{data['qr'].token}/loyalty",
        json=payload,
    )
    second = loyalty_db_client.post(
        f"/track/{data['qr'].token}/loyalty",
        json=payload,
    )

    assert first.status_code == second.status_code == 200
    assert first.json()["this_order"] == "pending"
    assert first.json()["pending"] == 1
    assert first.json()["stamps"] == 0
    assert second.json()["code"] == first.json()["code"]

    owner = loyalty_services.owner_hash(
        data["store"].id,
        "pending-device-secret",
    )
    card = loyalty_db.scalar(
        select(LoyaltyCard).where(
            LoyaltyCard.store_id == data["store"].id,
            LoyaltyCard.owner_hash == owner,
        )
    )
    assert card is not None

    stamps = loyalty_db.scalars(
        select(LoyaltyStamp).where(
            LoyaltyStamp.order_id == data["order"].id
        )
    ).all()
    assert len(stamps) == 1
    assert stamps[0].card_id == card.id
    assert stamps[0].confirmed_at is None


@pytest.mark.integration
def test_claim_collected_order_creates_confirmed_stamp(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
):
    data = loyalty_data
    assert _enable_loyalty(loyalty_db_client, data).status_code == 200

    data["order"].status = OrderStatus.COLLECTED
    loyalty_db.commit()

    response = loyalty_db_client.post(
        f"/track/{data['qr'].token}/loyalty",
        json={"device": "collected-device-secret"},
    )

    assert response.status_code == 200
    assert response.json()["this_order"] == "stamped"
    assert response.json()["stamps"] == 1
    assert response.json()["pending"] == 0

    stamp = loyalty_db.scalar(
        select(LoyaltyStamp).where(
            LoyaltyStamp.order_id == data["order"].id
        )
    )
    assert stamp.confirmed_at is not None


@pytest.mark.integration
def test_cancelled_order_does_not_create_stamp(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
):
    data = loyalty_data
    assert _enable_loyalty(loyalty_db_client, data).status_code == 200

    data["order"].status = OrderStatus.CANCELLED
    loyalty_db.commit()

    response = loyalty_db_client.post(
        f"/track/{data['qr'].token}/loyalty",
        json={"device": "cancelled-device-secret"},
    )

    assert response.status_code == 200
    assert response.json()["this_order"] == "none"
    assert loyalty_db.scalar(
        select(LoyaltyStamp).where(
            LoyaltyStamp.order_id == data["order"].id
        )
    ) is None


@pytest.mark.integration
def test_confirm_order_promotes_pending_stamp(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
    loyalty_services,
):
    data = loyalty_data
    assert _enable_loyalty(loyalty_db_client, data).status_code == 200

    claim = loyalty_db_client.post(
        f"/track/{data['qr'].token}/loyalty",
        json={"device": "confirm-device-secret"},
    )
    assert claim.status_code == 200
    assert claim.json()["pending"] == 1

    loyalty_services.LoyaltyService(loyalty_db).confirm_order(
        data["order"].id
    )
    loyalty_db.commit()
    loyalty_db.expire_all()

    stamp = loyalty_db.scalar(
        select(LoyaltyStamp).where(
            LoyaltyStamp.order_id == data["order"].id
        )
    )
    assert stamp.confirmed_at is not None


@pytest.mark.integration
def test_save_phone_persists_identity_and_phone_hint(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
    loyalty_services,
):
    data = loyalty_data
    assert _enable_loyalty(loyalty_db_client, data).status_code == 200

    response = loyalty_db_client.post(
        f"/track/{data['qr'].token}/loyalty/phone",
        json={
            "device": "phone-device-secret",
            "phone": "+961 3 555 444",
            "pin": "1234",
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["phone_saved"] is True
    assert body["phone_hint"].endswith("444")

    ident = loyalty_db.scalar(
        select(LoyaltyIdentity).where(
            LoyaltyIdentity.store_id == data["store"].id,
            LoyaltyIdentity.phone == "+9613555444",
        )
    )
    assert ident is not None
    assert loyalty_services._check_pin("1234", ident.pin_hash)
    assert not loyalty_services._check_pin("4321", ident.pin_hash)


@pytest.mark.integration
def test_wrong_pin_locks_identity(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
):
    data = loyalty_data
    assert _enable_loyalty(loyalty_db_client, data).status_code == 200

    first = loyalty_db_client.post(
        f"/track/{data['qr'].token}/loyalty/phone",
        json={
            "device": "lock-device-secret",
            "phone": "+9613555445",
            "pin": "1234",
        },
    )
    assert first.status_code == 200

    ident = loyalty_db.scalar(
        select(LoyaltyIdentity).where(
            LoyaltyIdentity.store_id == data["store"].id,
            LoyaltyIdentity.phone == "+9613555445",
        )
    )
    ident.failed_attempts = 4
    loyalty_db.commit()

    fifth_wrong = loyalty_db_client.post(
        f"/track/{data['qr'].token}/loyalty/phone",
        json={
            "device": "lock-device-secret",
            "phone": "+9613555445",
            "pin": "9999",
        },
    )

    assert fifth_wrong.status_code == 403
    assert fifth_wrong.json()["detail"] == "wrong_pin"

    loyalty_db.expire_all()
    ident = loyalty_db.get(LoyaltyIdentity, ident.id)
    assert ident.failed_attempts == 0
    assert ident.locked_until is not None

    locked = loyalty_db_client.post(
        f"/track/{data['qr'].token}/loyalty/phone",
        json={
            "device": "lock-device-secret",
            "phone": "+9613555445",
            "pin": "1234",
        },
    )

    assert locked.status_code == 403
    assert locked.json()["detail"] == "locked"


@pytest.mark.integration
def test_restore_card_moves_card_to_new_device(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
    loyalty_services,
):
    data = loyalty_data
    assert _enable_loyalty(loyalty_db_client, data).status_code == 200

    claimed = loyalty_db_client.post(
        f"/track/{data['qr'].token}/loyalty",
        json={"device": "old-device-secret"},
    )
    assert claimed.status_code == 200
    code = claimed.json()["code"]

    restored = loyalty_db_client.post(
        f"/track/{data['qr'].token}/loyalty/restore",
        json={
            "device": "new-device-secret",
            "code": code,
        },
    )

    assert restored.status_code == 200
    assert restored.json()["code"] == code

    loyalty_db.expire_all()
    card = loyalty_db.scalar(
        select(LoyaltyCard).where(
            LoyaltyCard.store_id == data["store"].id,
            LoyaltyCard.code == code,
        )
    )
    assert card.owner_hash == loyalty_services.owner_hash(
        data["store"].id,
        "new-device-secret",
    )


@pytest.mark.integration
def test_restore_unknown_code_returns_404(
    loyalty_db_client,
    loyalty_data,
):
    data = loyalty_data
    assert _enable_loyalty(loyalty_db_client, data).status_code == 200

    response = loyalty_db_client.post(
        f"/track/{data['qr'].token}/loyalty/restore",
        json={
            "device": "restore-device-secret",
            "code": "ZZZZ9999",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "No card with that code"


@pytest.mark.integration
def test_lookup_card_by_code_and_phone(
    loyalty_db_client,
    loyalty_data,
):
    data = loyalty_data
    assert _enable_loyalty(loyalty_db_client, data).status_code == 200

    saved = loyalty_db_client.post(
        f"/track/{data['qr'].token}/loyalty/phone",
        json={
            "device": "lookup-device-secret",
            "phone": "+9613555446",
            "pin": "1234",
        },
    )
    assert saved.status_code == 200
    code = saved.json()["code"]

    by_code = loyalty_db_client.get(
        f"/stores/{data['store'].id}/loyalty/cards/{code}"
        f"?actor_id={data['staff'].id}"
    )
    by_phone = loyalty_db_client.get(
        f"/stores/{data['store'].id}/loyalty/cards/+9613555446"
        f"?actor_id={data['staff'].id}"
    )

    assert by_code.status_code == 200
    assert by_phone.status_code == 200
    assert by_code.json()["card_id"] == by_phone.json()["card_id"]


@pytest.mark.integration
def test_lookup_missing_card_returns_404(
    loyalty_db_client,
    loyalty_data,
):
    data = loyalty_data
    assert _enable_loyalty(loyalty_db_client, data).status_code == 200

    response = loyalty_db_client.get(
        f"/stores/{data['store'].id}/loyalty/cards/ZZZZ9999"
        f"?actor_id={data['staff'].id}"
    )

    assert response.status_code == 404


@pytest.mark.integration
def test_redeem_by_code_consumes_goal_stamps(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
    loyalty_services,
):
    data = loyalty_data
    assert _enable_loyalty(
        loyalty_db_client,
        data,
        goal=3,
        reward="Free cookie",
    ).status_code == 200

    card = _make_card(
        loyalty_db,
        data["store"],
        device="redeem-device",
        code="RDM23456",
        loyalty_services=loyalty_services,
    )

    for number in (51, 52, 53):
        order = _loyalty_order(
            loyalty_db,
            data["store"],
            number=number,
            status=OrderStatus.COLLECTED,
        )
        loyalty_db.add(
            LoyaltyStamp(
                card_id=card.id,
                order_id=order.id,
                confirmed_at=datetime.now(timezone.utc),
            )
        )
    loyalty_db.commit()

    response = loyalty_db_client.post(
        f"/stores/{data['store'].id}/loyalty/cards/{card.code}/redeem"
        f"?actor_id={data['staff'].id}"
    )

    assert response.status_code == 200, response.text
    assert response.json()["stamps"] == 0
    assert response.json()["rewards_redeemed"] == 1

    redemption = loyalty_db.scalar(
        select(LoyaltyRedemption).where(
            LoyaltyRedemption.card_id == card.id
        )
    )
    assert redemption is not None
    assert redemption.redeemed_by == data["staff"].id
    assert redemption.stamps_used == 3
    assert redemption.reward_name == "Free cookie"


@pytest.mark.integration
def test_redeem_without_enough_stamps_returns_409(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
    loyalty_services,
):
    data = loyalty_data
    assert _enable_loyalty(
        loyalty_db_client,
        data,
        goal=3,
    ).status_code == 200

    card = _make_card(
        loyalty_db,
        data["store"],
        device="not-enough-device",
        code="LOW23456",
        loyalty_services=loyalty_services,
    )
    loyalty_db.commit()

    response = loyalty_db_client.post(
        f"/stores/{data['store'].id}/loyalty/cards/{card.code}/redeem"
        f"?actor_id={data['staff'].id}"
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Not enough stamps yet"


@pytest.mark.integration
def test_redeem_for_order_uses_order_card(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
    loyalty_services,
):
    data = loyalty_data
    assert _enable_loyalty(
        loyalty_db_client,
        data,
        goal=3,
    ).status_code == 200

    card = _make_card(
        loyalty_db,
        data["store"],
        device="order-redeem-device",
        code="ORD23456",
        loyalty_services=loyalty_services,
    )

    target = _loyalty_order(
        loyalty_db,
        data["store"],
        number=60,
        status=OrderStatus.READY,
    )
    loyalty_db.add(
        LoyaltyStamp(
            card_id=card.id,
            order_id=target.id,
            confirmed_at=None,
        )
    )

    for number in (61, 62, 63):
        collected = _loyalty_order(
            loyalty_db,
            data["store"],
            number=number,
            status=OrderStatus.COLLECTED,
        )
        loyalty_db.add(
            LoyaltyStamp(
                card_id=card.id,
                order_id=collected.id,
                confirmed_at=datetime.now(timezone.utc),
            )
        )
    loyalty_db.commit()

    response = loyalty_db_client.post(
        f"/stores/{data['store'].id}/loyalty/orders/{target.id}/redeem"
        f"?actor_id={data['staff'].id}"
    )

    assert response.status_code == 200
    redemption = loyalty_db.scalar(
        select(LoyaltyRedemption).where(
            LoyaltyRedemption.card_id == card.id
        )
    )
    assert redemption.order_id == target.id


@pytest.mark.integration
def test_redeem_for_unlinked_order_returns_404(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
):
    data = loyalty_data
    assert _enable_loyalty(loyalty_db_client, data).status_code == 200

    order = _loyalty_order(
        loyalty_db,
        data["store"],
        number=70,
    )
    loyalty_db.commit()

    response = loyalty_db_client.post(
        f"/stores/{data['store'].id}/loyalty/orders/{order.id}/redeem"
        f"?actor_id={data['staff'].id}"
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "That order has no loyalty card"


@pytest.mark.integration
def test_waiting_returns_active_orders_with_reward_ready(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
    loyalty_services,
):
    data = loyalty_data
    assert _enable_loyalty(
        loyalty_db_client,
        data,
        goal=3,
    ).status_code == 200

    card = _make_card(
        loyalty_db,
        data["store"],
        device="waiting-device",
        code="WAIT2345",
        loyalty_services=loyalty_services,
    )

    active = _loyalty_order(
        loyalty_db,
        data["store"],
        number=80,
        status=OrderStatus.READY,
    )
    loyalty_db.add(
        LoyaltyStamp(
            card_id=card.id,
            order_id=active.id,
            confirmed_at=None,
        )
    )

    for number in (81, 82, 83):
        old = _loyalty_order(
            loyalty_db,
            data["store"],
            number=number,
            status=OrderStatus.COLLECTED,
        )
        loyalty_db.add(
            LoyaltyStamp(
                card_id=card.id,
                order_id=old.id,
                confirmed_at=datetime.now(timezone.utc),
            )
        )
    loyalty_db.commit()

    response = loyalty_db_client.get(
        f"/stores/{data['store'].id}/loyalty/waiting"
        f"?actor_id={data['staff'].id}"
    )

    assert response.status_code == 200
    assert str(active.id) in response.json()["order_ids"]


@pytest.mark.integration
def test_stats_counts_cards_stamps_phone_and_redemptions(
    loyalty_db_client,
    loyalty_db,
    loyalty_data,
    loyalty_services,
):
    data = loyalty_data
    assert _enable_loyalty(
        loyalty_db_client,
        data,
        goal=3,
        reward="Free coffee",
    ).status_code == 200

    card = _make_card(
        loyalty_db,
        data["store"],
        device="stats-device",
        code="STAT2345",
        loyalty_services=loyalty_services,
    )

    loyalty_db.add(
        LoyaltyIdentity(
            store_id=data["store"].id,
            card_id=card.id,
            phone="+9613555447",
            pin_hash=loyalty_services._hash_pin("1234"),
        )
    )

    confirmed_orders = []
    for number in (91, 92, 93, 94):
        order = _loyalty_order(
            loyalty_db,
            data["store"],
            number=number,
            status=OrderStatus.COLLECTED,
        )
        confirmed_orders.append(order)
        loyalty_db.add(
            LoyaltyStamp(
                card_id=card.id,
                order_id=order.id,
                confirmed_at=datetime.now(timezone.utc),
            )
        )

    pending_order = _loyalty_order(
        loyalty_db,
        data["store"],
        number=95,
        status=OrderStatus.READY,
    )
    loyalty_db.add(
        LoyaltyStamp(
            card_id=card.id,
            order_id=pending_order.id,
            confirmed_at=None,
        )
    )
    loyalty_db.add(
        LoyaltyRedemption(
            card_id=card.id,
            redeemed_by=data["staff"].id,
            order_id=None,
            stamps_used=3,
            reward_name="Free coffee",
        )
    )
    loyalty_db.commit()

    response = loyalty_db_client.get(
        f"/stores/{data['store'].id}/loyalty/stats"
        f"?actor_id={data['manager'].id}"
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["enabled"] is True
    assert body["cards"] == 1
    assert body["stamps_given"] == 4
    assert body["stamps_pending"] == 1
    assert body["rewards_redeemed"] == 1
    assert body["cards_with_phone"] == 1
    assert body["new_cards_30d"] == 1
    assert len(body["recent"]) == 1
    assert body["recent"][0]["code"] == "STAT2345"
    assert body["recent"][0]["reward_name"] == "Free coffee"
    assert body["recent"][0]["by"] == "Staff"


@pytest.mark.integration
def test_disabled_program_lookup_returns_409(
    loyalty_db_client,
    loyalty_data,
):
    data = loyalty_data

    response = loyalty_db_client.get(
        f"/stores/{data['store'].id}/loyalty/cards/ABCD2345"
        f"?actor_id={data['staff'].id}"
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "The loyalty card is turned off"
