import pytest
from fastapi import HTTPException


def test_create_or_get_qr(client, qr_service, order_id, qr_response):
    qr_service.create_or_get.return_value = qr_response
    r = client.post(f"/orders/{order_id}/qr")
    assert r.status_code == 200
    assert r.json()["order_id"] == str(order_id)
    qr_service.create_or_get.assert_called_once_with(order_id)


def test_get_qr(client, qr_service, order_id, qr_response):
    qr_service.get_by_order.return_value = qr_response
    r = client.get(f"/orders/{order_id}/qr")
    assert r.status_code == 200
    qr_service.get_by_order.assert_called_once_with(order_id)


@pytest.mark.parametrize("method,path", [
    ("post", "/qr"),
    ("get", "/qr"),
    ("get", "/qr/image"),
    ("post", "/qr/rotate"),
    ("post", "/qr/revoke"),
])
def test_order_routes_reject_invalid_uuid(client, method, path):
    r = getattr(client, method)(f"/orders/not-a-uuid{path}")
    assert r.status_code == 422


@pytest.mark.parametrize("fmt,mime", [("png", "image/png"), ("svg", "image/svg+xml")])
def test_get_qr_image(client, qr_service, order_id, fmt, mime):
    payload = b"image-bytes"
    qr_service.get_image.return_value = payload
    r = client.get(f"/orders/{order_id}/qr/image?format={fmt}")
    assert r.status_code == 200
    assert r.content == payload
    assert r.headers["content-type"] == mime
    assert r.headers["cache-control"] == "no-store"
    qr_service.get_image.assert_called_once_with(order_id, fmt)


def test_get_qr_image_rejects_bad_format(client, qr_service, order_id):
    r = client.get(f"/orders/{order_id}/qr/image?format=jpg")
    assert r.status_code == 422
    qr_service.get_image.assert_not_called()


def test_rotate_qr(client, qr_service, order_id, qr_response):
    qr_service.rotate.return_value = qr_response
    r = client.post(f"/orders/{order_id}/qr/rotate")
    assert r.status_code == 200
    qr_service.rotate.assert_called_once_with(order_id)


def test_revoke_qr(client, qr_service, order_id, qr_response):
    qr_service.revoke.return_value = qr_response
    r = client.post(f"/orders/{order_id}/qr/revoke")
    assert r.status_code == 200
    qr_service.revoke.assert_called_once_with(order_id)


@pytest.mark.parametrize("endpoint,service_method", [
    ("/track/test-token", "track"),
    ("/track/test-token/scan", "scan"),
    ("/track/test-token/seen", "seen"),
    ("/track/test-token/coming", "coming"),
])
def test_public_tracking_routes(client, qr_service, public_response, endpoint, service_method):
    getattr(qr_service, service_method).return_value = public_response
    method = client.get if endpoint == "/track/test-token" else client.post
    r = method(endpoint)
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["referrer-policy"] == "no-referrer"
    getattr(qr_service, service_method).assert_called_once_with("test-token")


@pytest.mark.parametrize("stars", [1,2,3,4,5])
def test_rating_accepts_1_to_5(client, qr_service, public_response, stars):
    qr_service.rate.return_value = {**public_response, "rating": stars}
    r = client.post("/track/test-token/rating", json={"stars": stars})
    assert r.status_code == 200
    assert r.json()["rating"] == stars
    qr_service.rate.assert_called_once_with("test-token", stars)


@pytest.mark.parametrize("stars", [0,6,-1,99])
def test_rating_rejects_out_of_range(client, qr_service, stars):
    r = client.post("/track/test-token/rating", json={"stars": stars})
    assert r.status_code == 422
    qr_service.rate.assert_not_called()


@pytest.mark.parametrize("endpoint,method_name", [
    ("/orders/{order_id}/qr", "create_or_get"),
    ("/orders/{order_id}/qr", "get_by_order"),
    ("/orders/{order_id}/qr/rotate", "rotate"),
    ("/orders/{order_id}/qr/revoke", "revoke"),
])
def test_order_route_errors_propagate(client, qr_service, order_id, endpoint, method_name):
    getattr(qr_service, method_name).side_effect = HTTPException(404, "Not found")
    path = endpoint.format(order_id=order_id)
    method = client.get if method_name == "get_by_order" else client.post
    r = method(path)
    assert r.status_code == 404
