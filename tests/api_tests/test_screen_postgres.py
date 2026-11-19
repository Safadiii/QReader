import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from database.schema import Base, Store, User, UserRole
from modules.auth.passwords import hash_password
import modules.screens.routes as screen_routes

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
    app.include_router(screen_routes.router)
    app.dependency_overrides[screen_routes.get_db] = lambda: db_session

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
):
    user = User(
        store_id=store.id,
        name=name,
        phone=phone,
        role=role,
        is_active=active,
        password_hash=hash_password("password123"),
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture
def screen_data(db_session):
    store = Store(
        name="Screens Test Store",
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
        phone="+9613555201",
        role=UserRole.OWNER,
    )
    manager = _user(
        db_session,
        store,
        name="Manager",
        phone="+9613555202",
        role=UserRole.MANAGER,
    )
    staff = _user(
        db_session,
        store,
        name="Staff",
        phone="+9613555203",
        role=UserRole.STAFF,
    )
    inactive_manager = _user(
        db_session,
        store,
        name="Inactive Manager",
        phone="+9613555204",
        role=UserRole.MANAGER,
        active=False,
    )
    outsider = _user(
        db_session,
        other_store,
        name="Other Owner",
        phone="+9613555299",
        role=UserRole.OWNER,
    )

    db_session.commit()
    return {
        "store": store,
        "other_store": other_store,
        "owner": owner,
        "manager": manager,
        "staff": staff,
        "inactive_manager": inactive_manager,
        "outsider": outsider,
    }


@pytest.mark.parametrize("actor_key", ["owner", "manager"])
def test_manager_or_owner_can_issue_screen_links(
    db_client,
    db_session,
    screen_data,
    actor_key,
):
    data = screen_data

    response = db_client.get(
        f"/stores/{data['store'].id}/screens"
        f"?actor_id={data[actor_key].id}"
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["display_token"]
    assert body["waiting_token"]
    assert body["display_token"] != body["waiting_token"]

    db_session.expire_all()
    store = db_session.get(Store, data["store"].id)
    assert store.display_token == body["display_token"]
    assert store.waiting_token == body["waiting_token"]


def test_get_links_is_idempotent(
    db_client,
    screen_data,
):
    data = screen_data

    first = db_client.get(
        f"/stores/{data['store'].id}/screens"
        f"?actor_id={data['owner'].id}"
    )
    second = db_client.get(
        f"/stores/{data['store'].id}/screens"
        f"?actor_id={data['owner'].id}"
    )

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()


def test_staff_cannot_get_screen_links(
    db_client,
    screen_data,
):
    data = screen_data

    response = db_client.get(
        f"/stores/{data['store'].id}/screens"
        f"?actor_id={data['staff'].id}"
    )

    assert response.status_code == 403


def test_inactive_manager_cannot_get_screen_links(
    db_client,
    screen_data,
):
    data = screen_data

    response = db_client.get(
        f"/stores/{data['store'].id}/screens"
        f"?actor_id={data['inactive_manager'].id}"
    )

    assert response.status_code == 403


def test_actor_from_other_store_cannot_get_screen_links(
    db_client,
    screen_data,
):
    data = screen_data

    response = db_client.get(
        f"/stores/{data['store'].id}/screens"
        f"?actor_id={data['outsider'].id}"
    )

    assert response.status_code == 403


@pytest.mark.parametrize("kind", ["display", "waiting"])
def test_regenerate_changes_only_selected_token(
    db_client,
    screen_data,
    kind,
):
    data = screen_data

    initial = db_client.get(
        f"/stores/{data['store'].id}/screens"
        f"?actor_id={data['owner'].id}"
    )
    assert initial.status_code == 200
    before = initial.json()

    regenerated = db_client.post(
        f"/stores/{data['store'].id}/screens/{kind}/regenerate"
        f"?actor_id={data['owner'].id}"
    )

    assert regenerated.status_code == 200
    after = regenerated.json()

    changed = f"{kind}_token"
    other = "waiting_token" if kind == "display" else "display_token"
    assert after[changed] != before[changed]
    assert after[other] == before[other]


def test_regenerated_old_token_stops_resolving(
    db_client,
    screen_data,
):
    data = screen_data

    initial = db_client.get(
        f"/stores/{data['store'].id}/screens"
        f"?actor_id={data['owner'].id}"
    )
    old_display = initial.json()["display_token"]

    rotated = db_client.post(
        f"/stores/{data['store'].id}/screens/display/regenerate"
        f"?actor_id={data['owner'].id}"
    )
    new_display = rotated.json()["display_token"]

    old_result = db_client.get(f"/screens/{old_display}")
    new_result = db_client.get(f"/screens/{new_display}")

    assert old_result.status_code == 404
    assert new_result.status_code == 200
    assert new_result.json()["kind"] == "display"


def test_display_and_waiting_tokens_resolve_to_correct_kind(
    db_client,
    screen_data,
):
    data = screen_data

    links = db_client.get(
        f"/stores/{data['store'].id}/screens"
        f"?actor_id={data['manager'].id}"
    ).json()

    display = db_client.get(
        f"/screens/{links['display_token']}"
    )
    waiting = db_client.get(
        f"/screens/{links['waiting_token']}"
    )

    assert display.status_code == waiting.status_code == 200
    assert display.json() == {
        "store_id": str(data["store"].id),
        "store_name": data["store"].name,
        "kind": "display",
    }
    assert waiting.json() == {
        "store_id": str(data["store"].id),
        "store_name": data["store"].name,
        "kind": "waiting",
    }


def test_unknown_screen_token_returns_404(db_client):
    response = db_client.get("/screens/not-a-real-screen-token")

    assert response.status_code == 404
    assert response.json()["detail"] == "Screen not found"


def test_overlong_screen_token_returns_404(db_client):
    response = db_client.get("/screens/" + ("x" * 65))

    assert response.status_code == 404


def test_staff_cannot_regenerate_screen_token(
    db_client,
    screen_data,
):
    data = screen_data

    response = db_client.post(
        f"/stores/{data['store'].id}/screens/display/regenerate"
        f"?actor_id={data['staff'].id}"
    )

    assert response.status_code == 403


def test_invalid_screen_kind_returns_422(
    db_client,
    screen_data,
):
    data = screen_data

    response = db_client.post(
        f"/stores/{data['store'].id}/screens/projector/regenerate"
        f"?actor_id={data['owner'].id}"
    )

    assert response.status_code == 422
