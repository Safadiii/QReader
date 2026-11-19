"""Real PostgreSQL integration tests for the store router and SQLAlchemy models.

These are SKIPPED unless TEST_DATABASE_URL points to an isolated PostgreSQL DB
whose name ends in _test or starts with test_. Run after provisioning/migrating
that test database. Do not point at a development or production database.
"""

import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from database.schema import Base, Store, StoreAsset, StoreSettings

pytestmark = pytest.mark.integration

PNG = b"\x89PNG\r\n\x1a\n" + b"png-sample"
JPEG = b"\xff\xd8\xff" + b"jpeg-sample"
WEBP = b"RIFF" + (8).to_bytes(4, "little") + b"WEBP" + b"data"


@pytest.fixture(scope="session")
def pg_engine():
    raw_url = os.getenv("TEST_DATABASE_URL")
    if not raw_url:
        pytest.skip("Set TEST_DATABASE_URL for the PostgreSQL integration tests")

    url = make_url(raw_url)
    db_name = url.database or ""
    if url.get_backend_name() != "postgresql" or not (
        db_name.endswith("_test") or db_name.startswith("test_")
    ):
        pytest.fail(
            "Refusing to run: TEST_DATABASE_URL must point to PostgreSQL "
            "and a database whose name ends with '_test' or starts with 'test_'."
        )

    engine = create_engine(raw_url, pool_pre_ping=True)
    # Uses the provided complete database.schema.Base. In projects with Alembic,
    # prefer applying your migrations first; create_all only fills missing tables.
    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def db_session(pg_engine):
    """Production service commits are kept inside this rollback-only transaction."""
    connection = pg_engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()


@pytest.fixture
def db_client(app, store_routes, db_session):
    app.dependency_overrides[store_routes.get_db] = lambda: db_session
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def saved_store_id(db_session):
    store = Store(name="Test Coffee Store")
    db_session.add(store)
    db_session.flush()
    return store.id


def test_get_settings_creates_defaults_once(db_client, db_session, saved_store_id):
    url = f"/stores/{saved_store_id}/settings"
    first = db_client.get(url)
    second = db_client.get(url)

    assert first.status_code == second.status_code == 200
    settings = first.json()
    assert settings["store_id"] == str(saved_store_id)
    assert settings["name"] == "Test Coffee Store"
    assert settings["default_language"] == "tr"
    assert settings["google_min_stars"] == 4
    assert settings["links"] == {}
    assert settings["assets"] == {}
    assert db_session.get(StoreSettings, saved_store_id) is not None


def test_update_settings_persists_and_normalizes(
    db_client, db_session, saved_store_id
):
    response = db_client.put(
        f"/stores/{saved_store_id}/settings",
        json={
            "name": "  New Coffee  ",
            "default_language": "en",
            "alert_sound": "marimba",
            "alert_title_en": "  Order {number}  ",
            "ask_rating": False,
            "google_min_stars": 3,
            "google_review_url": " https://example.com/review ",
            "theme": "forest",
            "brand_color": "#123ABC",
            "links": {"website": " https://example.com ", "menu": "  "},
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "New Coffee"
    assert body["default_language"] == "en"
    assert body["links"] == {"website": "https://example.com"}
    assert body["alert_title_en"] == "Order {number}"

    db_session.expire_all()
    assert db_session.get(Store, saved_store_id).name == "New Coffee"
    settings = db_session.get(StoreSettings, saved_store_id)
    assert settings.default_language == "en"
    assert settings.alert_sound == "marimba"
    assert settings.google_min_stars == 3
    assert settings.ask_rating is False
    assert settings.theme == "forest"
    assert settings.brand_color == "#123ABC"
    assert settings.google_review_url == "https://example.com/review"


@pytest.mark.parametrize("kind,content,mime", [
    ("logo", PNG, "image/png"),
    ("banner", JPEG, "image/jpeg"),
    ("background", WEBP, "image/webp"),
])
def test_upload_get_delete_asset_lifecycle(
    db_client, db_session, saved_store_id, kind, content, mime
):
    url = f"/stores/{saved_store_id}/assets/{kind}"
    uploaded = db_client.put(
        url, content=content, headers={"content-type": "application/octet-stream"}
    )
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["assets"][kind].isdigit()
    asset = db_session.scalar(select(StoreAsset).where(
        StoreAsset.store_id == saved_store_id,
        StoreAsset.kind == kind,
    ))
    assert asset is not None
    assert asset.content_type == mime
    assert asset.data == content

    image = db_client.get(url)
    assert image.status_code == 200
    assert image.content == content
    assert image.headers["content-type"] == mime
    assert image.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert image.headers["x-content-type-options"] == "nosniff"

    deleted = db_client.delete(url)
    assert deleted.status_code == 200
    assert kind not in deleted.json()["assets"]
    assert db_client.get(url).status_code == 404


def test_upload_replaces_existing_asset(db_client, saved_store_id):
    url = f"/stores/{saved_store_id}/assets/logo"
    assert db_client.put(url, content=PNG).status_code == 200
    assert db_client.put(url, content=JPEG).status_code == 200
    response = db_client.get(url)
    assert response.status_code == 200
    assert response.content == JPEG
    assert response.headers["content-type"] == "image/jpeg"


@pytest.mark.parametrize("content", [
    b"", b"hello world", b"<svg xmlns='http://www.w3.org/2000/svg'></svg>",
])
def test_upload_rejects_unsupported_files(db_client, saved_store_id, content):
    response = db_client.put(
        f"/stores/{saved_store_id}/assets/logo", content=content,
    )
    assert response.status_code == 415
    assert response.json()["detail"] == "Use a PNG, JPEG or WebP image"


def test_upload_rejects_more_than_2mb(db_client, db_session, saved_store_id):
    content = PNG + b"x" * (2 * 1024 * 1024)
    response = db_client.put(
        f"/stores/{saved_store_id}/assets/logo", content=content,
    )
    assert response.status_code == 413
    assert db_session.scalar(select(StoreAsset).where(
        StoreAsset.store_id == saved_store_id
    )) is None


@pytest.mark.parametrize("method", ["get", "put", "delete"])
def test_unknown_image_kind_returns_404(db_client, saved_store_id, method):
    url = f"/stores/{saved_store_id}/assets/unknown"
    args = {"content": PNG} if method == "put" else {}
    response = getattr(db_client, method)(url, **args)
    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown image"


def test_missing_image_returns_404(db_client, saved_store_id):
    response = db_client.get(f"/stores/{saved_store_id}/assets/logo")
    assert response.status_code == 404
    assert response.json()["detail"] == "Image not found"


def test_deleting_missing_image_is_idempotent(db_client, saved_store_id):
    url = f"/stores/{saved_store_id}/assets/logo"
    assert db_client.delete(url).status_code == 200
    second = db_client.delete(url)
    assert second.status_code == 200
    assert second.json()["assets"] == {}


@pytest.mark.parametrize("method,path,payload", [
    ("get", "/settings", {}),
    ("put", "/settings", {"json": {"name": "New Store"}}),
    ("get", "/assets/logo", {}),
    ("put", "/assets/logo", {"content": PNG}),
    ("delete", "/assets/logo", {}),
])
def test_unknown_store_returns_404(db_client, method, path, payload):
    response = getattr(db_client, method)(f"/stores/{uuid4()}{path}", **payload)
    assert response.status_code == 404


def test_invalid_settings_do_not_modify_existing_data(
    db_client, db_session, saved_store_id
):
    url = f"/stores/{saved_store_id}/settings"
    response = db_client.put(
        url, json={"name": "Changed Name", "google_min_stars": 99}
    )
    assert response.status_code == 422
    db_session.expire_all()
    assert db_session.get(Store, saved_store_id).name == "Test Coffee Store"


def test_assets_are_isolated_between_stores(db_client, db_session, saved_store_id):
    another_store = Store(name="Another Store")
    db_session.add(another_store)
    db_session.flush()
    other_id = another_store.id

    assert db_client.put(f"/stores/{saved_store_id}/assets/logo", content=PNG).status_code == 200
    assert db_client.get(f"/stores/{other_id}/assets/logo").status_code == 404
    settings = db_client.get(f"/stores/{other_id}/settings")
    assert settings.status_code == 200
    assert settings.json()["assets"] == {}
