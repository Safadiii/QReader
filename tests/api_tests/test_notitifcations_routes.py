import pytest
from fastapi import HTTPException


def test_push_config(
    client,
    notification_service,
    notification_config_response,
):
    notification_service.config.return_value = notification_config_response

    response = client.get("/push/config")

    assert response.status_code == 200
    assert response.json() == notification_config_response
    notification_service.config.assert_called_once_with()


def test_subscribe_apns(
    client,
    notification_service,
    subscribe_response,
    apns_subscription_payload,
):
    notification_service.subscribe.return_value = subscribe_response

    response = client.post(
        "/track/test-token/subscribe",
        json=apns_subscription_payload,
    )

    assert response.status_code == 200
    assert response.json()["subscribed"] is True
    notification_service.subscribe.assert_called_once()

    token, body = notification_service.subscribe.call_args.args
    assert token == "test-token"
    assert body.provider == "apns"
    assert body.device_token == "a" * 64
    assert body.environment.value == "sandbox"


def test_subscribe_web_push(
    client,
    notification_service,
    subscribe_response,
    web_push_subscription_payload,
):
    notification_service.subscribe.return_value = subscribe_response

    response = client.post(
        "/track/test-token/subscribe",
        json=web_push_subscription_payload,
    )

    assert response.status_code == 200
    notification_service.subscribe.assert_called_once()

    token, body = notification_service.subscribe.call_args.args
    assert token == "test-token"
    assert body.provider == "web_push"
    assert body.endpoint == web_push_subscription_payload["endpoint"]
    assert body.platform.value == "android"


def test_web_push_platform_defaults_to_android(
    client,
    notification_service,
    subscribe_response,
    web_push_subscription_payload,
):
    notification_service.subscribe.return_value = subscribe_response
    payload = dict(web_push_subscription_payload)
    payload.pop("platform")

    response = client.post(
        "/track/test-token/subscribe",
        json=payload,
    )

    assert response.status_code == 200
    body = notification_service.subscribe.call_args.args[1]
    assert body.platform.value == "android"


@pytest.mark.parametrize(
    "payload",
    [
        {"provider": "unknown"},
        {"provider": "apns", "device_token": "a" * 63, "environment": "sandbox"},
        {"provider": "apns", "device_token": "z" * 64, "environment": "sandbox"},
        {"provider": "apns", "device_token": "a" * 64, "environment": "invalid"},
        {
            "provider": "web_push",
            "endpoint": "https://fcm.googleapis.com/test",
            "p256dh": "short",
            "auth": "a" * 16,
        },
        {
            "provider": "web_push",
            "endpoint": "https://fcm.googleapis.com/test",
            "p256dh": "p" * 32,
            "auth": "short",
        },
        {
            "provider": "web_push",
            "endpoint": "x" * 2001,
            "p256dh": "p" * 32,
            "auth": "a" * 16,
        },
        {
            "provider": "web_push",
            "endpoint": "https://fcm.googleapis.com/test",
            "p256dh": "p" * 32,
            "auth": "a" * 16,
            "platform": "windows",
        },
    ],
)
def test_subscribe_rejects_invalid_payloads(
    client,
    notification_service,
    payload,
):
    response = client.post(
        "/track/test-token/subscribe",
        json=payload,
    )

    assert response.status_code == 422
    notification_service.subscribe.assert_not_called()


def test_subscribe_propagates_unknown_token(
    client,
    notification_service,
    apns_subscription_payload,
):
    notification_service.subscribe.side_effect = HTTPException(
        404,
        "QR code not found",
    )

    response = client.post(
        "/track/not-found/subscribe",
        json=apns_subscription_payload,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "QR code not found"


def test_subscribe_propagates_finished_order_conflict(
    client,
    notification_service,
    apns_subscription_payload,
):
    notification_service.subscribe.side_effect = HTTPException(
        409,
        "This order is already finished",
    )

    response = client.post(
        "/track/test-token/subscribe",
        json=apns_subscription_payload,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "This order is already finished"


def test_subscribe_propagates_unknown_push_service(
    client,
    notification_service,
    web_push_subscription_payload,
):
    notification_service.subscribe.side_effect = HTTPException(
        422,
        "Unknown push service",
    )

    response = client.post(
        "/track/test-token/subscribe",
        json=web_push_subscription_payload,
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Unknown push service"
