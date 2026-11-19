from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from database.schema import UserRole


def test_get_links_issues_missing_tokens(
    screen_client,
    screen_db,
    screen_authorize,
    store_id,
    user_id,
):
    store = SimpleNamespace(
        id=store_id,
        name="Demo Store",
        display_token=None,
        waiting_token=None,
    )
    screen_db.get.return_value = store

    response = screen_client.get(
        f"/stores/{store_id}/screens?actor_id={user_id}"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["display_token"]
    assert body["waiting_token"]
    assert body["display_token"] != body["waiting_token"]
    assert store.display_token == body["display_token"]
    assert store.waiting_token == body["waiting_token"]
    screen_authorize.assert_called_once_with(
        screen_db,
        store_id,
        user_id,
        UserRole.MANAGER,
    )
    screen_db.commit.assert_called_once_with()


def test_get_links_keeps_existing_tokens(
    screen_client,
    screen_db,
    store_id,
    user_id,
):
    store = SimpleNamespace(
        id=store_id,
        name="Demo Store",
        display_token="display-existing",
        waiting_token="waiting-existing",
    )
    screen_db.get.return_value = store

    first = screen_client.get(
        f"/stores/{store_id}/screens?actor_id={user_id}"
    )
    second = screen_client.get(
        f"/stores/{store_id}/screens?actor_id={user_id}"
    )

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert first.json() == {
        "display_token": "display-existing",
        "waiting_token": "waiting-existing",
    }


def test_get_links_creates_only_missing_token(
    screen_client,
    screen_db,
    store_id,
    user_id,
):
    store = SimpleNamespace(
        id=store_id,
        name="Demo Store",
        display_token="keep-display",
        waiting_token=None,
    )
    screen_db.get.return_value = store

    response = screen_client.get(
        f"/stores/{store_id}/screens?actor_id={user_id}"
    )

    assert response.status_code == 200
    assert response.json()["display_token"] == "keep-display"
    assert response.json()["waiting_token"]
    assert store.display_token == "keep-display"


def test_get_links_missing_store_returns_404(
    screen_client,
    screen_db,
    store_id,
    user_id,
):
    screen_db.get.return_value = None

    response = screen_client.get(
        f"/stores/{store_id}/screens?actor_id={user_id}"
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Store not found"


def test_get_links_propagates_permission_error(
    screen_client,
    screen_authorize,
    store_id,
    user_id,
):
    screen_authorize.side_effect = HTTPException(
        403,
        "Your role cannot do this",
    )

    response = screen_client.get(
        f"/stores/{store_id}/screens?actor_id={user_id}"
    )

    assert response.status_code == 403


@pytest.mark.parametrize("kind", ["display", "waiting"])
def test_regenerate_changes_only_selected_token(
    screen_client,
    screen_db,
    store_id,
    user_id,
    kind,
):
    store = SimpleNamespace(
        id=store_id,
        name="Demo Store",
        display_token="old-display",
        waiting_token="old-waiting",
    )
    screen_db.get.return_value = store

    response = screen_client.post(
        f"/stores/{store_id}/screens/{kind}/regenerate"
        f"?actor_id={user_id}"
    )

    assert response.status_code == 200
    body = response.json()

    if kind == "display":
        assert body["display_token"] != "old-display"
        assert body["waiting_token"] == "old-waiting"
    else:
        assert body["display_token"] == "old-display"
        assert body["waiting_token"] != "old-waiting"

    screen_db.commit.assert_called_once_with()


def test_regenerate_initializes_both_tokens_before_rotation(
    screen_client,
    screen_db,
    store_id,
    user_id,
):
    store = SimpleNamespace(
        id=store_id,
        name="Demo Store",
        display_token=None,
        waiting_token=None,
    )
    screen_db.get.return_value = store

    response = screen_client.post(
        f"/stores/{store_id}/screens/display/regenerate"
        f"?actor_id={user_id}"
    )

    assert response.status_code == 200
    assert response.json()["display_token"]
    assert response.json()["waiting_token"]
    assert response.json()["display_token"] != response.json()["waiting_token"]


def test_regenerate_rejects_invalid_kind(
    screen_client,
    screen_db,
    store_id,
    user_id,
):
    response = screen_client.post(
        f"/stores/{store_id}/screens/projector/regenerate"
        f"?actor_id={user_id}"
    )

    assert response.status_code == 422
    screen_db.get.assert_not_called()


def test_regenerate_missing_store_returns_404(
    screen_client,
    screen_db,
    store_id,
    user_id,
):
    screen_db.get.return_value = None

    response = screen_client.post(
        f"/stores/{store_id}/screens/display/regenerate"
        f"?actor_id={user_id}"
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Store not found"


@pytest.mark.parametrize(
    "kind",
    ["display", "waiting"],
)
def test_resolve_screen_token(
    screen_client,
    screen_db,
    store_id,
    kind,
):
    store = SimpleNamespace(
        id=store_id,
        name="Demo Store",
        display_token="display-token",
        waiting_token="waiting-token",
    )
    screen_db.scalar.return_value = store
    token = getattr(store, f"{kind}_token")

    response = screen_client.get(f"/screens/{token}")

    assert response.status_code == 200
    assert response.json() == {
        "store_id": str(store_id),
        "store_name": "Demo Store",
        "kind": kind,
    }


def test_resolve_unknown_token_returns_404(
    screen_client,
    screen_db,
):
    screen_db.scalar.return_value = None

    response = screen_client.get("/screens/not-known")

    assert response.status_code == 404
    assert response.json()["detail"] == "Screen not found"


def test_resolve_overlong_token_returns_404_without_db_query(
    screen_client,
    screen_db,
):
    response = screen_client.get("/screens/" + ("x" * 65))

    assert response.status_code == 404
    assert response.json()["detail"] == "Screen not found"
    screen_db.scalar.assert_not_called()


def test_screen_routes_reject_invalid_uuids(
    screen_client,
    screen_db,
):
    valid = "00000000-0000-0000-0000-000000000001"

    invalid_store = screen_client.get(
        f"/stores/not-a-uuid/screens?actor_id={valid}"
    )
    invalid_actor = screen_client.get(
        f"/stores/{valid}/screens?actor_id=not-a-uuid"
    )

    assert invalid_store.status_code == 422
    assert invalid_actor.status_code == 422
    screen_db.get.assert_not_called()
