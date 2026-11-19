"""HTTP route/validation tests; do not require a running PostgreSQL instance."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from conftest import settings_response


BASE_IMAGE = b"\x89PNG\r\n\x1a\n" + b"sample-image-data"


def test_get_settings_returns_response(client, service, store_id):
    service.get_settings.return_value = settings_response(store_id)

    response = client.get(f"/stores/{store_id}/settings")

    assert response.status_code == 200
    assert response.json()["store_id"] == str(store_id)
    assert response.json()["name"] == "Demo Store"
    assert response.json()["default_language"] == "tr"
    service.get_settings.assert_called_once_with(store_id)


def test_get_settings_missing_store(client, service, store_id):
    service.get_settings.side_effect = HTTPException(404, "Store not found")
    response = client.get(f"/stores/{store_id}/settings")
    assert response.status_code == 404
    assert response.json() == {"detail": "Store not found"}


def test_get_settings_rejects_invalid_uuid(client, service):
    response = client.get("/stores/not-a-uuid/settings")
    assert response.status_code == 422
    service.get_settings.assert_not_called()


def test_update_settings_passes_validated_and_cleaned_body(
    client, service, store_id, store_routes
):
    service.update_settings.return_value = settings_response(
        store_id, name="Coffee Corner", default_language="en", theme="ocean",
        google_min_stars=5, brand_color="#aBc123",
        alert_title_en="Order {number}",
        google_review_url="https://example.com/reviews",
        links={"website": "https://example.com"},
    )

    response = client.put(
        f"/stores/{store_id}/settings",
        json={
            "name": "  Coffee Corner  ",
            "default_language": "en",
            "theme": "ocean",
            "google_min_stars": 5,
            "brand_color": "#aBc123",
            "alert_title_en": " Order {number}  ",
            "google_review_url": " https://example.com/reviews ",
            "links": {
                "website": " https://example.com ",
                "instagram": "   ",
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Coffee Corner"
    service.update_settings.assert_called_once()
    actual_id, body = service.update_settings.call_args.args
    assert actual_id == store_id
    assert isinstance(body, store_routes.StoreSettingsBody)
    assert body.name == "Coffee Corner"
    assert body.alert_title_en == "Order {number}"
    assert body.google_review_url == "https://example.com/reviews"
    assert body.links == {"website": "https://example.com"}


@pytest.mark.parametrize(
    "field,value",
    [
        ("name", ""),
        ("name", "x" * 151),
        ("default_language", "fr"),
        ("alert_sound", "siren"),
        ("theme", "neon"),
        ("google_min_stars", 2),
        ("google_min_stars", 6),
        ("brand_color", "red"),
        ("brand_color", "#12345Z"),
        ("links", {"website": "javascript:alert(1)"}),
        ("links", {"unrecognized": "https://example.com"}),
        ("google_review_url", "data:text/html,hello"),
        ("banner_url", "ftp://example.com/a.png"),
        ("alert_title_en", "x" * 121),
        ("alert_text_tr", "x" * 201),
    ],
)
def test_update_settings_rejects_invalid_fields(
    client, service, store_id, field, value
):
    response = client.put(
        f"/stores/{store_id}/settings",
        json={"name": "Valid Store", field: value},
    )
    assert response.status_code == 422, response.text
    service.update_settings.assert_not_called()


def test_update_settings_name_is_required(client, service, store_id):
    response = client.put(f"/stores/{store_id}/settings", json={"theme": "ocean"})
    assert response.status_code == 422
    service.update_settings.assert_not_called()


def test_update_settings_missing_store(client, service, store_id):
    service.update_settings.side_effect = HTTPException(404, "Store not found")
    response = client.put(
        f"/stores/{store_id}/settings", json={"name": "Test Store"}
    )
    assert response.status_code == 404


def test_get_asset_returns_exact_bytes_and_security_headers(client, service, store_id):
    service.get_asset.return_value = SimpleNamespace(
        data=BASE_IMAGE, content_type="image/png"
    )

    response = client.get(f"/stores/{store_id}/assets/logo")

    assert response.status_code == 200
    assert response.content == BASE_IMAGE
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert response.headers["x-content-type-options"] == "nosniff"
    service.get_asset.assert_called_once_with(store_id, "logo")


@pytest.mark.parametrize("kind", ["logo", "background", "banner"])
def test_upload_passes_raw_bytes_to_service(client, service, store_id, kind):
    service.put_asset.return_value = settings_response(
        store_id, assets={kind: "1234567890123"}
    )
    response = client.put(
        f"/stores/{store_id}/assets/{kind}",
        content=BASE_IMAGE,
        headers={"Content-Type": "application/octet-stream"},
    )

    assert response.status_code == 200
    assert response.json()["assets"][kind] == "1234567890123"
    service.put_asset.assert_called_once_with(store_id, kind, BASE_IMAGE)


def test_delete_asset_passes_kind_to_service(client, service, store_id):
    service.delete_asset.return_value = settings_response(store_id)
    response = client.delete(f"/stores/{store_id}/assets/banner")
    assert response.status_code == 200
    assert response.json()["assets"] == {}
    service.delete_asset.assert_called_once_with(store_id, "banner")


@pytest.mark.parametrize("method,path", [
    ("GET", "/settings"),
    ("PUT", "/settings"),
    ("GET", "/assets/logo"),
    ("PUT", "/assets/logo"),
    ("DELETE", "/assets/logo"),
])
def test_each_route_rejects_invalid_store_id(client, service, method, path):
    kwargs = {}
    if method == "PUT" and path == "/settings":
        kwargs["json"] = {"name": "Valid Store"}
    elif method == "PUT":
        kwargs["content"] = BASE_IMAGE
    response = client.request(method, "/stores/not-a-uuid" + path, **kwargs)
    assert response.status_code == 422


def test_get_asset_propagates_404(client, service, store_id):
    service.get_asset.side_effect = HTTPException(404, "Image not found")
    response = client.get(f"/stores/{store_id}/assets/logo")
    assert response.status_code == 404
    assert response.json()["detail"] == "Image not found"


@pytest.mark.parametrize("kind", ["logo", "banner", "background"])
def test_delete_asset_missing_store(client, service, store_id, kind):
    service.delete_asset.side_effect = HTTPException(404, "Store not found")
    response = client.delete(f"/stores/{store_id}/assets/{kind}")
    assert response.status_code == 404


@pytest.mark.xfail(
    reason="Current routes.py has no staff authentication on write endpoints",
    strict=True,
)
def test_settings_write_requires_authentication_before_production(
    client, service, store_id
):
    """Security TODO: enable this as a passing test when authentication is implemented."""
    service.update_settings.return_value = settings_response(store_id)
    response = client.put(
        f"/stores/{store_id}/settings", json={"name": "Demo Store"}
    )
    assert response.status_code in (401, 403)


@pytest.mark.xfail(
    reason="StoreSettingsBody strips name after min_length validation, accepting blanks",
    strict=True,
)
def test_settings_name_whitespace_only_is_rejected(client, service, store_id):
    response = client.put(
        f"/stores/{store_id}/settings", json={"name": "    "}
    )
    assert response.status_code == 422
