import os
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from database.schema import Base, Store, User, UserRole
import modules.auth.routes as auth_routes
import modules.auth.services as auth_services
from modules.auth.passwords import hash_password, verify_password

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


@pytest.fixture(autouse=True)
def clear_login_failures():
    auth_services._failures.clear()
    try:
        yield
    finally:
        auth_services._failures.clear()


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
    app.include_router(auth_routes.router)
    app.dependency_overrides[auth_routes.get_db] = lambda: db_session

    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def saved_user(db_session):
    store = Store(
        name="Auth Test Store",
        timezone="Asia/Beirut",
    )
    db_session.add(store)
    db_session.flush()

    password = "correct-password"
    user = User(
        store_id=store.id,
        name="Existing Owner",
        phone="+9613123456",
        password_hash=hash_password(password),
        role=UserRole.OWNER,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return store, user, password


def test_signup_creates_store_and_owner(db_client, db_session):
    response = db_client.post(
        "/auth/signup",
        json={
            "store_name": "  New Coffee  ",
            "name": "  Abed  ",
            "phone": "+961 3 555-123",
            "password": "strong-password-123",
            "timezone": "Europe/Istanbul",
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["store_name"] == "New Coffee"
    assert body["name"] == "Abed"
    assert body["phone"] == "+9613555123"
    assert body["role"] == "owner"

    user = db_session.get(User, body["id"])
    assert user is not None
    assert user.role == UserRole.OWNER
    assert user.phone == "+9613555123"
    assert user.password_hash != "strong-password-123"
    assert verify_password("strong-password-123", user.password_hash)

    store = db_session.get(Store, user.store_id)
    assert store is not None
    assert store.name == "New Coffee"
    assert store.timezone == "Europe/Istanbul"


def test_signup_invalid_timezone_falls_back_to_beirut(
    db_client,
    db_session,
):
    response = db_client.post(
        "/auth/signup",
        json={
            "store_name": "Fallback Store",
            "name": "Owner",
            "phone": "+9613555124",
            "password": "strong-password-123",
            "timezone": "Not/A-Timezone",
        },
    )

    assert response.status_code == 201
    user = db_session.get(User, response.json()["id"])
    store = db_session.get(Store, user.store_id)
    assert store.timezone == "Asia/Beirut"


def test_signup_without_timezone_uses_beirut(
    db_client,
    db_session,
):
    response = db_client.post(
        "/auth/signup",
        json={
            "store_name": "Default Timezone",
            "name": "Owner",
            "phone": "+9613555125",
            "password": "strong-password-123",
        },
    )

    assert response.status_code == 201
    user = db_session.get(User, response.json()["id"])
    assert db_session.get(Store, user.store_id).timezone == "Asia/Beirut"


def test_duplicate_phone_returns_409(db_client, saved_user):
    _, user, _ = saved_user

    response = db_client.post(
        "/auth/signup",
        json={
            "store_name": "Another Store",
            "name": "Another Owner",
            "phone": user.phone,
            "password": "strong-password-123",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "That phone number already has an account"


def test_login_success_and_phone_normalization(db_client, saved_user):
    _, user, password = saved_user

    response = db_client.post(
        "/auth/login",
        json={
            "phone": "+961 3 123-456",
            "password": password,
        },
    )

    assert response.status_code == 200
    assert response.json()["id"] == str(user.id)
    assert response.json()["phone"] == user.phone
    assert response.json()["role"] == "owner"


def test_login_accepts_00_international_prefix(db_client, saved_user):
    _, user, password = saved_user

    response = db_client.post(
        "/auth/login",
        json={
            "phone": "00961 3 123 456",
            "password": password,
        },
    )

    assert response.status_code == 200
    assert response.json()["id"] == str(user.id)


def test_wrong_password_returns_generic_401(db_client, saved_user):
    _, _, _ = saved_user

    response = db_client.post(
        "/auth/login",
        json={
            "phone": "+9613123456",
            "password": "wrong-password",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Wrong phone number or password"


def test_unknown_phone_returns_same_generic_401(db_client):
    response = db_client.post(
        "/auth/login",
        json={
            "phone": "+9613999999",
            "password": "wrong-password",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Wrong phone number or password"


def test_inactive_user_cannot_login(
    db_client,
    db_session,
    saved_user,
):
    _, user, password = saved_user
    user.is_active = False
    db_session.commit()

    response = db_client.post(
        "/auth/login",
        json={
            "phone": user.phone,
            "password": password,
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Wrong phone number or password"


def test_successful_login_clears_previous_failures(
    db_client,
    saved_user,
):
    _, user, password = saved_user

    for _ in range(2):
        assert db_client.post(
            "/auth/login",
            json={"phone": user.phone, "password": "wrong"},
        ).status_code == 401

    assert user.phone in auth_services._failures

    success = db_client.post(
        "/auth/login",
        json={"phone": user.phone, "password": password},
    )

    assert success.status_code == 200
    assert user.phone not in auth_services._failures


def test_login_rate_limit_after_five_failures(
    db_client,
    monkeypatch,
):
    # Lockout behavior is what this test targets; avoid doing six expensive scrypt
    # derivations here because password hashing itself has separate unit tests.
    monkeypatch.setattr(auth_services, "verify_password", lambda password, stored: False)

    phone = "+9613888888"
    for _ in range(auth_services.MAX_FAILURES):
        response = db_client.post(
            "/auth/login",
            json={"phone": phone, "password": "wrong"},
        )
        assert response.status_code == 401

    blocked = db_client.post(
        "/auth/login",
        json={"phone": phone, "password": "wrong"},
    )

    assert blocked.status_code == 429
    assert "15 minutes" in blocked.json()["detail"]


def test_current_member_returns_active_user(
    db_client,
    saved_user,
):
    _, user, _ = saved_user

    response = db_client.get(f"/auth/members/{user.id}")

    assert response.status_code == 200
    assert response.json()["id"] == str(user.id)


def test_current_member_inactive_returns_404(
    db_client,
    db_session,
    saved_user,
):
    _, user, _ = saved_user
    user.is_active = False
    db_session.commit()

    response = db_client.get(f"/auth/members/{user.id}")

    assert response.status_code == 404


def test_current_member_missing_returns_404(db_client):
    response = db_client.get(f"/auth/members/{uuid4()}")

    assert response.status_code == 404
