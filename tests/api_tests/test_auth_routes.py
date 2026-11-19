import pytest
from fastapi import HTTPException


def test_login(client, auth_service, staff_response):
    auth_service.login.return_value = staff_response

    response = client.post(
        "/auth/login",
        json={
            "phone": "+961 3 123 456",
            "password": "secret",
        },
    )

    assert response.status_code == 200
    assert response.json()["phone"] == "+9613123456"
    auth_service.login.assert_called_once_with(
        "+961 3 123 456",
        "secret",
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"phone": "", "password": "secret"},
        {"phone": "+9613", "password": ""},
        {"phone": "x" * 41, "password": "secret"},
        {"phone": "+9613123456", "password": "x" * 201},
    ],
)
def test_login_rejects_invalid_body(client, auth_service, payload):
    response = client.post("/auth/login", json=payload)

    assert response.status_code == 422
    auth_service.login.assert_not_called()


def test_login_propagates_wrong_credentials(client, auth_service):
    auth_service.login.side_effect = HTTPException(
        401,
        "Wrong phone number or password",
    )

    response = client.post(
        "/auth/login",
        json={
            "phone": "+9613123456",
            "password": "wrong",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Wrong phone number or password"


def test_login_propagates_rate_limit(client, auth_service):
    auth_service.login.side_effect = HTTPException(
        429,
        "Too many attempts. Try again in 15 minutes.",
    )

    response = client.post(
        "/auth/login",
        json={
            "phone": "+9613123456",
            "password": "wrong",
        },
    )

    assert response.status_code == 429


def test_signup_normalizes_and_trims_body(
    client,
    auth_service,
    staff_response,
):
    auth_service.signup.return_value = staff_response

    response = client.post(
        "/auth/signup",
        json={
            "store_name": "  Demo Store  ",
            "name": "  Test Owner  ",
            "phone": "+961 3 123-456",
            "password": "strong-password-123",
            "timezone": "Asia/Beirut",
        },
    )

    assert response.status_code == 201
    auth_service.signup.assert_called_once()

    body = auth_service.signup.call_args.args[0]
    assert body.store_name == "Demo Store"
    assert body.name == "Test Owner"
    assert body.phone == "+9613123456"
    assert body.password == "strong-password-123"
    assert body.timezone == "Asia/Beirut"


@pytest.mark.parametrize(
    "payload",
    [
        {
            "store_name": "   ",
            "name": "Owner",
            "phone": "+9613123456",
            "password": "1234567890",
        },
        {
            "store_name": "Store",
            "name": "   ",
            "phone": "+9613123456",
            "password": "1234567890",
        },
        {
            "store_name": "Store",
            "name": "Owner",
            "phone": "03123456",
            "password": "1234567890",
        },
        {
            "store_name": "Store",
            "name": "Owner",
            "phone": "+0123456789",
            "password": "1234567890",
        },
        {
            "store_name": "Store",
            "name": "Owner",
            "phone": "+9613123456",
            "password": "short",
        },
        {
            "store_name": "x" * 151,
            "name": "Owner",
            "phone": "+9613123456",
            "password": "1234567890",
        },
        {
            "store_name": "Store",
            "name": "Owner",
            "phone": "+9613123456",
            "password": "1234567890",
            "timezone": "x" * 65,
        },
    ],
)
def test_signup_rejects_invalid_body(client, auth_service, payload):
    response = client.post("/auth/signup", json=payload)

    assert response.status_code == 422
    auth_service.signup.assert_not_called()


def test_signup_propagates_duplicate_phone(
    client,
    auth_service,
    signup_payload,
):
    auth_service.signup.side_effect = HTTPException(
        409,
        "That phone number already has an account",
    )

    response = client.post("/auth/signup", json=signup_payload)

    assert response.status_code == 409
    assert response.json()["detail"] == "That phone number already has an account"


def test_current_member(
    client,
    auth_service,
    user_id,
    staff_response,
):
    auth_service.current.return_value = staff_response

    response = client.get(f"/auth/members/{user_id}")

    assert response.status_code == 200
    assert response.json()["id"] == str(user_id)
    auth_service.current.assert_called_once_with(user_id)


def test_current_member_invalid_uuid(client, auth_service):
    response = client.get("/auth/members/not-a-uuid")

    assert response.status_code == 422
    auth_service.current.assert_not_called()


def test_current_member_propagates_404(
    client,
    auth_service,
    user_id,
):
    auth_service.current.side_effect = HTTPException(404, "Not found")

    response = client.get(f"/auth/members/{user_id}")

    assert response.status_code == 404
    assert response.json()["detail"] == "Not found"
