import pytest
from fastapi import HTTPException


def test_list_team(
    client,
    team_service,
    store_id,
    user_id,
    team_member_response,
):
    team_service.list.return_value = [team_member_response]

    response = client.get(
        f"/stores/{store_id}/team?actor_id={user_id}"
    )

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == team_member_response["id"]
    team_service.list.assert_called_once_with(store_id, user_id)


def test_list_team_requires_actor_id(
    client,
    team_service,
    store_id,
):
    response = client.get(f"/stores/{store_id}/team")

    assert response.status_code == 422
    team_service.list.assert_not_called()


def test_list_team_rejects_invalid_store_or_actor_uuid(
    client,
    team_service,
    store_id,
):
    invalid_store = client.get(
        "/stores/not-a-uuid/team?actor_id=00000000-0000-0000-0000-000000000001"
    )
    invalid_actor = client.get(
        f"/stores/{store_id}/team?actor_id=not-a-uuid"
    )

    assert invalid_store.status_code == 422
    assert invalid_actor.status_code == 422
    team_service.list.assert_not_called()


def test_add_member_normalizes_phone_and_name(
    client,
    team_service,
    store_id,
    user_id,
    member_with_password_response,
):
    team_service.add.return_value = member_with_password_response

    response = client.post(
        f"/stores/{store_id}/team?actor_id={user_id}",
        json={
            "name": "  New Staff  ",
            "phone": "+961 3 555-000",
            "role": "staff",
            "password": "password123",
        },
    )

    assert response.status_code == 201
    assert response.json()["temporary_password"] == "TempPass23"
    team_service.add.assert_called_once()

    actual_store, actual_actor, body = team_service.add.call_args.args
    assert actual_store == store_id
    assert actual_actor == user_id
    assert body.name == "New Staff"
    assert body.phone == "+9613555000"
    assert body.role.value == "staff"
    assert body.password == "password123"


def test_add_member_defaults_role_to_staff(
    client,
    team_service,
    store_id,
    user_id,
    member_with_password_response,
):
    team_service.add.return_value = member_with_password_response

    response = client.post(
        f"/stores/{store_id}/team?actor_id={user_id}",
        json={
            "name": "New Staff",
            "phone": "+9613555000",
        },
    )

    assert response.status_code == 201
    body = team_service.add.call_args.args[2]
    assert body.role.value == "staff"
    assert body.password is None


@pytest.mark.parametrize(
    "payload",
    [
        {
            "name": "",
            "phone": "+9613555000",
        },
        {
            "name": "x" * 151,
            "phone": "+9613555000",
        },
        {
            "name": "Staff",
            "phone": "03555000",
        },
        {
            "name": "Staff",
            "phone": "+9613555000",
            "password": "short",
        },
        {
            "name": "Staff",
            "phone": "+9613555000",
            "password": "x" * 201,
        },
        {
            "name": "Staff",
            "phone": "+9613555000",
            "role": "invalid",
        },
    ],
)
def test_add_member_rejects_invalid_body(
    client,
    team_service,
    store_id,
    user_id,
    payload,
):
    response = client.post(
        f"/stores/{store_id}/team?actor_id={user_id}",
        json=payload,
    )

    assert response.status_code == 422
    team_service.add.assert_not_called()


@pytest.mark.xfail(
    reason=(
        "MemberCreate validates min_length before stripping name, "
        "so whitespace-only names currently become an empty string"
    ),
    strict=True,
)
def test_add_member_rejects_whitespace_only_name(
    client,
    team_service,
    store_id,
    user_id,
):
    response = client.post(
        f"/stores/{store_id}/team?actor_id={user_id}",
        json={
            "name": "   ",
            "phone": "+9613555000",
        },
    )

    assert response.status_code == 422


def test_add_member_propagates_permission_error(
    client,
    team_service,
    store_id,
    user_id,
):
    team_service.add.side_effect = HTTPException(
        403,
        "Your role cannot add this kind of member",
    )

    response = client.post(
        f"/stores/{store_id}/team?actor_id={user_id}",
        json={
            "name": "Manager",
            "phone": "+9613555000",
            "role": "manager",
        },
    )

    assert response.status_code == 403


def test_add_member_propagates_duplicate_phone(
    client,
    team_service,
    store_id,
    user_id,
):
    team_service.add.side_effect = HTTPException(
        409,
        "That phone number already has a login",
    )

    response = client.post(
        f"/stores/{store_id}/team?actor_id={user_id}",
        json={
            "name": "Staff",
            "phone": "+9613555000",
        },
    )

    assert response.status_code == 409


def test_update_member(
    client,
    team_service,
    store_id,
    user_id,
    team_member_id,
    team_member_response,
):
    updated = {
        **team_member_response,
        "name": "Updated Name",
        "role": "manager",
        "is_active": False,
    }
    team_service.update.return_value = updated

    response = client.patch(
        f"/stores/{store_id}/team/{team_member_id}?actor_id={user_id}",
        json={
            "name": " Updated Name ",
            "role": "manager",
            "is_active": False,
        },
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Updated Name"
    team_service.update.assert_called_once()

    actual_store, actual_actor, actual_user, body = (
        team_service.update.call_args.args
    )
    assert actual_store == store_id
    assert actual_actor == user_id
    assert actual_user == team_member_id
    assert body.name == " Updated Name "
    assert body.role.value == "manager"
    assert body.is_active is False


def test_update_member_allows_partial_body(
    client,
    team_service,
    store_id,
    user_id,
    team_member_id,
    team_member_response,
):
    team_service.update.return_value = {
        **team_member_response,
        "is_active": False,
    }

    response = client.patch(
        f"/stores/{store_id}/team/{team_member_id}?actor_id={user_id}",
        json={"is_active": False},
    )

    assert response.status_code == 200
    body = team_service.update.call_args.args[3]
    assert body.name is None
    assert body.role is None
    assert body.is_active is False


def test_update_member_rejects_invalid_role(
    client,
    team_service,
    store_id,
    user_id,
    team_member_id,
):
    response = client.patch(
        f"/stores/{store_id}/team/{team_member_id}?actor_id={user_id}",
        json={"role": "invalid"},
    )

    assert response.status_code == 422
    team_service.update.assert_not_called()


def test_update_member_propagates_not_found(
    client,
    team_service,
    store_id,
    user_id,
    team_member_id,
):
    team_service.update.side_effect = HTTPException(
        404,
        "Member not found",
    )

    response = client.patch(
        f"/stores/{store_id}/team/{team_member_id}?actor_id={user_id}",
        json={"name": "New Name"},
    )

    assert response.status_code == 404


def test_reset_password(
    client,
    team_service,
    store_id,
    user_id,
    team_member_id,
    member_with_password_response,
):
    team_service.reset_password.return_value = member_with_password_response

    response = client.post(
        f"/stores/{store_id}/team/{team_member_id}/reset-password"
        f"?actor_id={user_id}"
    )

    assert response.status_code == 200
    assert response.json()["temporary_password"] == "TempPass23"
    team_service.reset_password.assert_called_once_with(
        store_id,
        user_id,
        team_member_id,
    )


@pytest.mark.parametrize(
    "path",
    [
        "/stores/not-a-uuid/team/00000000-0000-0000-0000-000000000001",
        "/stores/00000000-0000-0000-0000-000000000001/team/not-a-uuid",
    ],
)
def test_member_management_rejects_invalid_path_uuid(
    client,
    team_service,
    path,
):
    response = client.patch(
        f"{path}?actor_id=00000000-0000-0000-0000-000000000002",
        json={"name": "Name"},
    )
    assert response.status_code == 422
    team_service.update.assert_not_called()
