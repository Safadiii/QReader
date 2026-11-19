import pytest

import modules.notifications.providers as providers


def _clear_apns_env(monkeypatch):
    for name in (
        "APNS_KEY_ID",
        "APNS_TEAM_ID",
        "APNS_BUNDLE_ID",
        "APNS_PRIVATE_KEY",
        "APNS_HOST",
    ):
        monkeypatch.delenv(name, raising=False)


def test_apns_configured_is_false_without_keys(monkeypatch):
    _clear_apns_env(monkeypatch)
    assert providers.apns_configured() is False


def test_apns_configured_requires_all_keys(monkeypatch):
    _clear_apns_env(monkeypatch)
    monkeypatch.setenv("APNS_KEY_ID", "key")
    monkeypatch.setenv("APNS_TEAM_ID", "team")
    monkeypatch.setenv("APNS_BUNDLE_ID", "bundle")
    assert providers.apns_configured() is False

    monkeypatch.setenv("APNS_PRIVATE_KEY", "private")
    assert providers.apns_configured() is True


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://fcm.googleapis.com/fcm/send/abc",
        "https://updates.push.services.mozilla.com/wpush/v2/abc",
        "https://web.push.apple.com/abc",
        "https://wns.notify.windows.com/abc",
    ],
)
def test_allowed_web_push_endpoint_accepts_known_hosts(
    monkeypatch,
    endpoint,
):
    monkeypatch.delenv("WEB_PUSH_EXTRA_HOSTS", raising=False)
    assert providers.allowed_web_push_endpoint(endpoint) is True


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://fcm.googleapis.com/fcm/send/abc",
        "https://example.com/push",
        "file:///tmp/push",
        "javascript:alert(1)",
    ],
)
def test_allowed_web_push_endpoint_rejects_unknown_or_insecure_hosts(
    monkeypatch,
    endpoint,
):
    monkeypatch.delenv("WEB_PUSH_EXTRA_HOSTS", raising=False)
    assert providers.allowed_web_push_endpoint(endpoint) is False


def test_extra_web_push_host_can_be_enabled_for_local_testing(monkeypatch):
    monkeypatch.setenv("WEB_PUSH_EXTRA_HOSTS", "push.test.local")
    assert providers.allowed_web_push_endpoint(
        "http://push.test.local/test"
    ) is True


def test_send_apns_returns_configuration_error_without_network(monkeypatch):
    _clear_apns_env(monkeypatch)

    result = providers.send_apns(
        "a" * 64,
        "sandbox",
        "Title",
        "Body",
        {"order_number": 1},
    )

    assert result.ok is False
    assert result.gone is False
    assert result.error == "APNs is not configured"


def test_send_web_push_returns_configuration_error_without_vapid(monkeypatch):
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)

    result = providers.send_web_push(
        "https://fcm.googleapis.com/fcm/send/test",
        "p" * 32,
        "a" * 16,
        "Title",
        "Body",
        {"order_number": 1},
    )

    assert result.ok is False
    assert result.gone is False
    assert result.error == "Web Push is not configured"
