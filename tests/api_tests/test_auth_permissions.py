from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from database.schema import UserRole
from modules.auth.permissions import require_actor


class FakeDB:
    def __init__(self, actor):
        self.actor = actor

    def get(self, model, actor_id):
        return self.actor


@pytest.mark.parametrize(
    "role,required",
    [
        (UserRole.OWNER, UserRole.OWNER),
        (UserRole.OWNER, UserRole.MANAGER),
        (UserRole.OWNER, UserRole.STAFF),
        (UserRole.MANAGER, UserRole.MANAGER),
        (UserRole.MANAGER, UserRole.STAFF),
        (UserRole.STAFF, UserRole.STAFF),
    ],
)
def test_require_actor_allows_sufficient_role(role, required):
    store_id = uuid4()
    actor = SimpleNamespace(
        id=uuid4(),
        store_id=store_id,
        is_active=True,
        role=role,
    )

    result = require_actor(
        FakeDB(actor),
        store_id,
        actor.id,
        required,
    )

    assert result is actor


@pytest.mark.parametrize(
    "role,required",
    [
        (UserRole.STAFF, UserRole.MANAGER),
        (UserRole.STAFF, UserRole.OWNER),
        (UserRole.MANAGER, UserRole.OWNER),
    ],
)
def test_require_actor_rejects_insufficient_role(role, required):
    store_id = uuid4()
    actor = SimpleNamespace(
        id=uuid4(),
        store_id=store_id,
        is_active=True,
        role=role,
    )

    with pytest.raises(HTTPException) as exc:
        require_actor(
            FakeDB(actor),
            store_id,
            actor.id,
            required,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Your role cannot do this"


@pytest.mark.parametrize("case", ["missing", "inactive", "wrong_store"])
def test_require_actor_rejects_invalid_actor(case):
    store_id = uuid4()
    actor_id = uuid4()

    if case == "missing":
        actor = None
    elif case == "inactive":
        actor = SimpleNamespace(
            id=actor_id,
            store_id=store_id,
            is_active=False,
            role=UserRole.OWNER,
        )
    else:
        actor = SimpleNamespace(
            id=actor_id,
            store_id=uuid4(),
            is_active=True,
            role=UserRole.OWNER,
        )

    with pytest.raises(HTTPException) as exc:
        require_actor(
            FakeDB(actor),
            store_id,
            actor_id,
            UserRole.STAFF,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Not allowed"
