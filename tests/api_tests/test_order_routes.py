from types import SimpleNamespace

import pytest
from fastapi import HTTPException


def test_create_order(client, order_service, store_id, order_response):
    order_service.create_order.return_value = order_response
    response = client.post(
        "/orders/",
        json={"store_id": str(store_id), "order_number": 1},
    )

    assert response.status_code == 201
    assert response.json()["order_number"] == 1
    order_service.create_order.assert_called_once()

    data = order_service.create_order.call_args.args[0]
    assert data.store_id == store_id
    assert data.order_number == 1


@pytest.mark.parametrize("order_number", [0, -1, -100])
def test_create_order_rejects_non_positive_number(
    client, order_service, store_id, order_number
):
    response = client.post(
        "/orders/",
        json={"store_id": str(store_id), "order_number": order_number},
    )

    assert response.status_code == 422
    order_service.create_order.assert_not_called()


def test_create_order_rejects_invalid_store_uuid(client, order_service):
    response = client.post(
        "/orders/",
        json={"store_id": "not-a-uuid", "order_number": 1},
    )

    assert response.status_code == 422
    order_service.create_order.assert_not_called()


def test_get_orders(client, order_service, store_id, order_response):
    order_service.get_orders.return_value = [order_response]

    response = client.get(f"/orders/?store_id={store_id}")

    assert response.status_code == 200
    assert len(response.json()) == 1
    order_service.get_orders.assert_called_once_with(store_id)


def test_get_orders_requires_store_id(client, order_service):
    response = client.get("/orders/")
    assert response.status_code == 422
    order_service.get_orders.assert_not_called()


def test_get_order(client, order_service, order_id, order_response):
    order_service.get_order.return_value = order_response

    response = client.get(f"/orders/{order_id}")

    assert response.status_code == 200
    assert response.json()["id"] == str(order_id)
    order_service.get_order.assert_called_once_with(order_id)


def test_get_order_rejects_invalid_uuid(client, order_service):
    response = client.get("/orders/not-a-uuid")
    assert response.status_code == 422
    order_service.get_order.assert_not_called()


def test_get_order_propagates_404(client, order_service, order_id):
    order_service.get_order.side_effect = HTTPException(404, "Order not found")

    response = client.get(f"/orders/{order_id}")

    assert response.status_code == 404
    assert response.json()["detail"] == "Order not found"


def test_analytics(client, order_service, store_id, analytics_response):
    order_service.analytics.return_value = analytics_response

    response = client.get(f"/orders/analytics?store_id={store_id}&days=30")

    assert response.status_code == 200
    assert response.json()["days"] == 30
    order_service.analytics.assert_called_once_with(store_id, 30)


@pytest.mark.parametrize("days", [0, 366, -1])
def test_analytics_rejects_invalid_days(client, order_service, store_id, days):
    response = client.get(f"/orders/analytics?store_id={store_id}&days={days}")

    assert response.status_code == 422
    order_service.analytics.assert_not_called()


def test_analytics_default_days_is_30(
    client, order_service, store_id, analytics_response
):
    order_service.analytics.return_value = analytics_response

    response = client.get(f"/orders/analytics?store_id={store_id}")

    assert response.status_code == 200
    order_service.analytics.assert_called_once_with(store_id, 30)


@pytest.mark.parametrize(
    "status",
    ["preparing", "ready", "collected", "cancelled"],
)
def test_update_status_accepts_valid_status(
    client, order_service, order_routes, order_id, order_response, status
):
    order_service.update_status.return_value = SimpleNamespace(
        **{**order_response, "status": status}
    )

    response = client.patch(
        f"/orders/{order_id}/status",
        json={"status": status},
    )

    assert response.status_code == 200
    assert response.json()["status"] == status
    order_service.update_status.assert_called_once()

    kwargs = order_service.update_status.call_args.kwargs
    assert kwargs["order_id"] == order_id
    assert kwargs["new_status"].value == status
    assert kwargs["store_id"] is None


def test_update_status_passes_optional_store_id(
    client, order_service, order_id, store_id, order_response
):
    order_service.update_status.return_value = SimpleNamespace(
        **{**order_response, "status": "preparing"}
    )

    response = client.patch(
        f"/orders/{order_id}/status?store_id={store_id}",
        json={"status": "preparing"},
    )

    assert response.status_code == 200
    assert order_service.update_status.call_args.kwargs["store_id"] == store_id


def test_update_status_rejects_invalid_status(client, order_service, order_id):
    response = client.patch(
        f"/orders/{order_id}/status",
        json={"status": "unknown"},
    )

    assert response.status_code == 422
    order_service.update_status.assert_not_called()


def test_update_status_propagates_conflict(
    client, order_service, order_id
):
    order_service.update_status.side_effect = HTTPException(
        409, "Cannot transition from pending to collected"
    )

    response = client.patch(
        f"/orders/{order_id}/status",
        json={"status": "collected"},
    )

    assert response.status_code == 409


def test_ring_again(client, order_service, order_id, order_response):
    order_service.ring_again.return_value = SimpleNamespace(
        **{**order_response, "status": "ready"}
    )

    response = client.post(f"/orders/{order_id}/ring")

    assert response.status_code == 200
    order_service.ring_again.assert_called_once_with(order_id, store_id=None)


def test_ring_again_passes_store_id(
    client, order_service, order_id, store_id, order_response
):
    order_service.ring_again.return_value = SimpleNamespace(
        **{**order_response, "status": "ready"}
    )

    response = client.post(f"/orders/{order_id}/ring?store_id={store_id}")

    assert response.status_code == 200
    order_service.ring_again.assert_called_once_with(
        order_id, store_id=store_id
    )


def test_ring_again_propagates_conflict(client, order_service, order_id):
    order_service.ring_again.side_effect = HTTPException(
        409, "Only a ready order can be rung"
    )

    response = client.post(f"/orders/{order_id}/ring")

    assert response.status_code == 409


def test_management_routes_reject_invalid_order_uuid(client, order_service):
    patch_response = client.patch(
        "/orders/not-a-uuid/status",
        json={"status": "preparing"},
    )
    ring_response = client.post("/orders/not-a-uuid/ring")

    assert patch_response.status_code == 422
    assert ring_response.status_code == 422
