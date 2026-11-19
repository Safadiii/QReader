import pytest
from fastapi import HTTPException

import modules.auth.api_key as api_key


def test_api_key_disabled_accepts_requests(monkeypatch):
    monkeypatch.setattr(api_key, "API_KEY", "")

    assert api_key.require_api_key("") is None
    assert api_key.require_api_key("anything") is None


def test_correct_api_key_is_accepted(monkeypatch):
    monkeypatch.setattr(api_key, "API_KEY", "super-secret")

    assert api_key.require_api_key("super-secret") is None


@pytest.mark.parametrize("provided", ["", "wrong", "Super-Secret"])
def test_missing_or_wrong_api_key_is_rejected(monkeypatch, provided):
    monkeypatch.setattr(api_key, "API_KEY", "super-secret")

    with pytest.raises(HTTPException) as exc:
        api_key.require_api_key(provided)

    assert exc.value.status_code == 401
    assert exc.value.detail == "Missing or wrong API key"
