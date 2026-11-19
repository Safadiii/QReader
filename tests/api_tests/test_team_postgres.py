import os
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from database.schema import Base, Store, User, UserRole
from modules.auth.passwords import hash_password, verify_password
import modules.team.routes as team_routes

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
    app.include_router(team_routes.router)
    app.dependency_overrides[team_routes.get_db] = lambda: db_session

    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


def _user(
    db_session,
    store,
    *,
    name,
    phone,
    role,
    active=True,
    password="password123",
):
    user = User(
        store_id=store.id,
        name=name,
        phone=phone,
        role=role,
        is_active=active,
        password_hash=hash_password(password),
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture
def team_data(db_session):
    store = Store(
        name="Team Test Store",
        timezone="Asia/Beirut",
    )
    other_store = Store(
        name="Other Store",
        timezone="Asia/Beirut",
    )
    db_session.add_all([store, other_store])
    db_session.flush()

    owner = _user(
        db_session,
        store,
        name="Owner",
        phone="+9613555101",
        role=UserRole.OWNER,
    )
    manager = _user(
        db_session,
        store,
        name="Manager",
        phone="+9613555102",
        role=UserRole.MANAGER,
    )
    staff = _user(
        db_session,
        store,
        name="Staff",
        phone="+9613555103",
        role=UserRole.STAFF,
    )
    inactive_staff = _user(
        db_session,
        store,
        name="Removed",
        phone="+9613555104",
        role=UserRole.STAFF,
        active=False,
    )
    outsider = _user(
        db_session,
        other_store,
        name="Other Owner",
        phone="+9613555199",
        role=UserRole.OWNER,
    )
    db_session.commit()

    return {
        "store": store,
        "other_store": other_store,
        "owner": owner,
        "manager": manager,
        "staff": staff,
        "inactive_staff": inactive_staff,
        "outsider": outsider,
    }


def test_owner_can_list_team(db_client, team_data):
    data = team_data
    response = db_client.get(
        f"/stores/{data['store'].id}/team?actor_id={data['owner'].id}"
    )

    assert response.status_code == 200
    members = response.json()
    ids = {row["id"] for row in members}
    assert str(data["owner"].id) in ids
    assert str(data["manager"].id) in ids
    assert str(data["staff"].id) in ids
    assert str(data["inactive_staff"].id) in ids
    assert str(data["outsider"].id) not in ids


def test_manager_can_list_team(db_client, team_data):
    data = team_data
    response = db_client.get(
        f"/stores/{data['store'].id}/team?actor_id={data['manager'].id}"
    )
    assert response.status_code == 200


def test_staff_cannot_list_team(db_client, team_data):
    data = team_data
    response = db_client.get(
        f"/stores/{data['store'].id}/team?actor_id={data['staff'].id}"
    )

    assert response.status_code == 403


def test_inactive_actor_cannot_manage_team(db_client, team_data):
    data = team_data
    response = db_client.get(
        f"/stores/{data['store'].id}/team"
        f"?actor_id={data['inactive_staff'].id}"
    )

    assert response.status_code == 403


def test_actor_from_other_store_cannot_manage_team(
    db_client,
    team_data,
):
    data = team_data
    response = db_client.get(
        f"/stores/{data['store'].id}/team"
        f"?actor_id={data['outsider'].id}"
    )

    assert response.status_code == 403


def test_owner_adds_manager_with_explicit_password(
    db_client,
    db_session,
    team_data,
):
    data = team_data
    response = db_client.post(
        f"/stores/{data['store'].id}/team"
        f"?actor_id={data['owner'].id}",
        json={
            "name": "New Manager",
            "phone": "+961 3 555-120",
            "role": "manager",
            "password": "managerpass",
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["temporary_password"] == "managerpass"
    assert body["member"]["role"] == "manager"
    assert body["member"]["phone"] == "+9613555120"

    user = db_session.scalar(
        select(User).where(User.phone == "+9613555120")
    )
    assert user is not None
    assert user.store_id == data["store"].id
    assert user.role == UserRole.MANAGER
    assert verify_password("managerpass", user.password_hash)


def test_owner_adds_staff_with_generated_password(
    db_client,
    db_session,
    team_data,
):
    data = team_data
    response = db_client.post(
        f"/stores/{data['store'].id}/team"
        f"?actor_id={data['owner'].id}",
        json={
            "name": "Generated Staff",
            "phone": "+9613555121",
            "role": "staff",
        },
    )

    assert response.status_code == 201
    password = response.json()["temporary_password"]
    assert len(password) == 10

    user = db_session.scalar(
        select(User).where(User.phone == "+9613555121")
    )
    assert verify_password(password, user.password_hash)


@pytest.mark.parametrize("role", ["manager", "owner"])
def test_manager_cannot_add_manager_or_owner(
    db_client,
    team_data,
    role,
):
    data = team_data
    response = db_client.post(
        f"/stores/{data['store'].id}/team"
        f"?actor_id={data['manager'].id}",
        json={
            "name": "Forbidden",
            "phone": "+9613555122",
            "role": role,
        },
    )

    assert response.status_code == 403


def test_manager_can_add_staff(db_client, team_data):
    data = team_data
    response = db_client.post(
        f"/stores/{data['store'].id}/team"
        f"?actor_id={data['manager'].id}",
        json={
            "name": "Allowed Staff",
            "phone": "+9613555123",
            "role": "staff",
        },
    )

    assert response.status_code == 201


def test_owner_cannot_add_another_owner(db_client, team_data):
    data = team_data
    response = db_client.post(
        f"/stores/{data['store'].id}/team"
        f"?actor_id={data['owner'].id}",
        json={
            "name": "Second Owner",
            "phone": "+9613555124",
            "role": "owner",
        },
    )

    assert response.status_code == 403


def test_duplicate_phone_returns_409(db_client, team_data):
    data = team_data
    response = db_client.post(
        f"/stores/{data['store'].id}/team"
        f"?actor_id={data['owner'].id}",
        json={
            "name": "Duplicate",
            "phone": data["staff"].phone,
            "role": "staff",
        },
    )

    assert response.status_code == 409


def test_owner_updates_staff_name_role_and_active_state(
    db_client,
    db_session,
    team_data,
):
    data = team_data

    response = db_client.patch(
        f"/stores/{data['store'].id}/team/{data['staff'].id}"
        f"?actor_id={data['owner'].id}",
        json={
            "name": "  Promoted Staff  ",
            "role": "manager",
            "is_active": False,
        },
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Promoted Staff"
    assert body["role"] == "manager"
    assert body["is_active"] is False

    db_session.expire_all()
    user = db_session.get(User, data["staff"].id)
    assert user.name == "Promoted Staff"
    assert user.role == UserRole.MANAGER
    assert user.is_active is False


def test_manager_can_update_staff_name_and_active_state(
    db_client,
    db_session,
    team_data,
):
    data = team_data

    response = db_client.patch(
        f"/stores/{data['store'].id}/team/{data['staff'].id}"
        f"?actor_id={data['manager'].id}",
        json={
            "name": "Renamed Staff",
            "is_active": False,
        },
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Renamed Staff"
    assert response.json()["is_active"] is False


def test_manager_cannot_change_roles(
    db_client,
    team_data,
):
    data = team_data

    response = db_client.patch(
        f"/stores/{data['store'].id}/team/{data['staff'].id}"
        f"?actor_id={data['manager'].id}",
        json={"role": "manager"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Only the owner can change roles"


def test_nobody_can_manage_owner(db_client, team_data):
    data = team_data

    response = db_client.patch(
        f"/stores/{data['store'].id}/team/{data['owner'].id}"
        f"?actor_id={data['owner'].id}",
        json={"name": "Changed Owner"},
    )

    assert response.status_code == 403


def test_manager_cannot_manage_another_manager(
    db_client,
    team_data,
):
    data = team_data

    response = db_client.patch(
        f"/stores/{data['store'].id}/team/{data['manager'].id}"
        f"?actor_id={data['manager'].id}",
        json={"name": "Changed Manager"},
    )

    assert response.status_code == 403


def test_member_from_other_store_returns_404(
    db_client,
    team_data,
):
    data = team_data

    response = db_client.patch(
        f"/stores/{data['store'].id}/team/{data['outsider'].id}"
        f"?actor_id={data['owner'].id}",
        json={"name": "Nope"},
    )

    assert response.status_code == 404


def test_owner_cannot_promote_member_to_owner(
    db_client,
    team_data,
):
    data = team_data

    response = db_client.patch(
        f"/stores/{data['store'].id}/team/{data['staff'].id}"
        f"?actor_id={data['owner'].id}",
        json={"role": "owner"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "A store has one owner"


def test_reset_password_changes_hash_and_returns_plaintext_once(
    db_client,
    db_session,
    team_data,
):
    data = team_data
    old_hash = data["staff"].password_hash

    response = db_client.post(
        f"/stores/{data['store'].id}/team/{data['staff'].id}/reset-password"
        f"?actor_id={data['owner'].id}"
    )

    assert response.status_code == 200
    temporary = response.json()["temporary_password"]
    assert len(temporary) == 10

    db_session.expire_all()
    user = db_session.get(User, data["staff"].id)
    assert user.password_hash != old_hash
    assert verify_password(temporary, user.password_hash)


def test_manager_can_reset_staff_password(
    db_client,
    team_data,
):
    data = team_data

    response = db_client.post(
        f"/stores/{data['store'].id}/team/{data['staff'].id}/reset-password"
        f"?actor_id={data['manager'].id}"
    )

    assert response.status_code == 200


def test_manager_cannot_reset_manager_password(
    db_client,
    team_data,
):
    data = team_data

    response = db_client.post(
        f"/stores/{data['store'].id}/team/{data['manager'].id}/reset-password"
        f"?actor_id={data['manager'].id}"
    )

    assert response.status_code == 403


def test_owner_cannot_reset_owner_password(
    db_client,
    team_data,
):
    data = team_data

    response = db_client.post(
        f"/stores/{data['store'].id}/team/{data['owner'].id}/reset-password"
        f"?actor_id={data['owner'].id}"
    )

    assert response.status_code == 403
