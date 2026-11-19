from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from unittest.mock import ANY


from database.schema import UserRole


def test_get_delivery(
    mobile_client,
    mobile_service,
    mobile_qr_service,
    delivery_state_response,
):
    order = SimpleNamespace(id="order", store_id="store")
    mobile_qr_service._resolve.return_value = (object(), order)
    mobile_service.state.return_value = delivery_state_response

    response = mobile_client.get("/track/test-token/delivery")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    mobile_qr_service._resolve.assert_called_once_with("test-token")
    mobile_service.state.assert_called_once_with(order)


def test_choose_delivery(
    mobile_client,
    mobile_service,
    mobile_qr_service,
    delivery_state_response,
):
    order = SimpleNamespace(id="order", store_id="store")
    mobile_qr_service._resolve.return_value = (object(), order)
    mobile_service.choose.return_value = {
        **delivery_state_response,
        "mode": "car",
        "car_plate": "34ABC123",
    }

    response = mobile_client.post(
        "/track/test-token/delivery",
        json={
            "mode": "car",
            "car_plate": "34 ABC 123",
            "car_color": "Black",
        },
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"

    actual_order, body = mobile_service.choose.call_args.args
    assert actual_order is order
    assert body.mode == "car"
    assert body.car_plate == "34 ABC 123"


def test_choose_delivery_rejects_invalid_mode(
    mobile_client,
    mobile_service,
    mobile_qr_service,
):
    response = mobile_client.post(
        "/track/test-token/delivery",
        json={"mode": "drone"},
    )

    assert response.status_code == 422
    mobile_qr_service._resolve.assert_not_called()
    mobile_service.choose.assert_not_called()


def test_public_menu(
    mobile_client,
    mobile_service,
    store_id,
    public_menu_response,
):
    mobile_service.public_menu.return_value = public_menu_response

    response = mobile_client.get(
        f"/stores/{store_id}/menu/public"
    )

    assert response.status_code == 200
    assert response.json()["store_name"] == "Demo Store"
    mobile_service.public_menu.assert_called_once_with(store_id)


def test_place_order(
    mobile_client,
    mobile_service,
    store_id,
    menu_item_id,
    placed_order_response,
):
    mobile_service.place_order.return_value = placed_order_response

    response = mobile_client.post(
        f"/stores/{store_id}/menu/order",
        json={
            "mode": "collect",
            "customer_name": "Abed",
            "note": "No sugar",
            "lines": [
                {"item_id": str(menu_item_id), "qty": 2}
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["order_number"] == 1001
    actual_store, body = mobile_service.place_order.call_args.args
    assert actual_store == store_id
    assert body.mode == "collect"
    assert body.lines[0].qty == 2


def test_place_order_requires_at_least_one_line(
    mobile_client,
    mobile_service,
    store_id,
):
    response = mobile_client.post(
        f"/stores/{store_id}/menu/order",
        json={
            "mode": "collect",
            "lines": [],
        },
    )

    assert response.status_code == 422
    mobile_service.place_order.assert_not_called()


def test_car_page(
    mobile_client,
    mobile_service,
    store_id,
    car_page_response,
):
    mobile_service.car_page.return_value = car_page_response

    response = mobile_client.get(
        f"/stores/{store_id}/car/public"
    )

    assert response.status_code == 200
    assert response.json()["available"] is True
    mobile_service.car_page.assert_called_once_with(store_id)


def test_car_order(
    mobile_client,
    mobile_service,
    store_id,
    placed_order_response,
):
    mobile_service.car_order.return_value = placed_order_response

    response = mobile_client.post(
        f"/stores/{store_id}/car/order",
        json={
            "what": "Two coffees",
            "customer_name": "Abed",
            "car_plate": "34 ABC 123",
            "car_color": "Black",
        },
    )

    assert response.status_code == 200
    actual_store, body = mobile_service.car_order.call_args.args
    assert actual_store == store_id
    assert body.what == "Two coffees"
    assert body.car_plate == "34 ABC 123"


def test_get_mobile_settings_requires_staff(
    mobile_client,
    mobile_service,
    mobile_authorize,
    store_id,
    user_id,
    mobile_settings_response,
):
    mobile_service.get_settings.return_value = mobile_settings_response

    response = mobile_client.get(
        f"/stores/{store_id}/mobile-orders?actor_id={user_id}"
    )

    assert response.status_code == 200
    mobile_authorize.assert_called_once_with(
        ANY,
        store_id,
        user_id,
        UserRole.STAFF,
    )
    mobile_service.get_settings.assert_called_once_with(store_id)


def test_save_mobile_settings_requires_manager(
    mobile_client,
    mobile_service,
    mobile_authorize,
    store_id,
    user_id,
    mobile_settings_response,
):
    mobile_service.save_settings.return_value = mobile_settings_response

    response = mobile_client.put(
        f"/stores/{store_id}/mobile-orders?actor_id={user_id}",
        json={
            "enabled": True,
            "collect_enabled": True,
            "car_enabled": True,
            "table_enabled": False,
            "table_count": 0,
            "hours_mode": "custom",
            "opens": "08:30",
            "closes": "23:00",
        },
    )

    assert response.status_code == 200
    mobile_authorize.assert_called_once_with(
        ANY,
        store_id,
        user_id,
        UserRole.MANAGER,
    )
    actual_store, body = mobile_service.save_settings.call_args.args
    assert actual_store == store_id
    assert body.opens == "08:30"
    assert body.hours_mode == "custom"


@pytest.mark.parametrize(
    "field,value",
    [
        ("table_count", -1),
        ("table_count", 201),
        ("hours_mode", "sometimes"),
        ("opens", "8:00"),
        ("opens", "25:00"),
        ("closes", "12:60"),
    ],
)
def test_save_mobile_settings_rejects_invalid_values(
    mobile_client,
    mobile_service,
    store_id,
    user_id,
    field,
    value,
):
    payload = {
        "enabled": True,
        "collect_enabled": True,
        "car_enabled": False,
        "table_enabled": False,
        "table_count": 0,
        "hours_mode": "always",
        "opens": "08:00",
        "closes": "22:00",
    }
    payload[field] = value

    response = mobile_client.put(
        f"/stores/{store_id}/mobile-orders?actor_id={user_id}",
        json=payload,
    )

    assert response.status_code == 422
    mobile_service.save_settings.assert_not_called()


def test_get_deliveries_requires_staff(
    mobile_client,
    mobile_service,
    mobile_authorize,
    store_id,
    user_id,
    delivery_list_response,
):
    mobile_service.deliveries.return_value = delivery_list_response

    response = mobile_client.get(
        f"/stores/{store_id}/deliveries?actor_id={user_id}"
    )

    assert response.status_code == 200
    mobile_authorize.assert_called_once_with(
        ANY,
        store_id,
        user_id,
        UserRole.STAFF,
    )
    mobile_service.deliveries.assert_called_once_with(store_id)


def test_get_menu_requires_staff(
    mobile_client,
    mobile_service,
    mobile_authorize,
    store_id,
    user_id,
    menu_response,
):
    mobile_service.get_menu.return_value = menu_response

    response = mobile_client.get(
        f"/stores/{store_id}/menu?actor_id={user_id}"
    )

    assert response.status_code == 200
    mobile_authorize.assert_called_once_with(
        ANY,
        store_id,
        user_id,
        UserRole.STAFF,
    )
    mobile_service.get_menu.assert_called_once_with(store_id)


def test_save_menu_requires_manager(
    mobile_client,
    mobile_service,
    mobile_authorize,
    store_id,
    user_id,
    menu_response,
):
    mobile_service.save_menu.return_value = menu_response

    response = mobile_client.put(
        f"/stores/{store_id}/menu?actor_id={user_id}",
        json={
            "enabled": True,
            "currency": "₺",
            "note": " Fresh today ",
            "items": [
                {
                    "category": " Coffee ",
                    "name": " Latte ",
                    "description": " Milk coffee ",
                    "price_cents": 25000,
                    "available": True,
                }
            ],
        },
    )

    assert response.status_code == 200
    mobile_authorize.assert_called_once_with(
        ANY,
        store_id,
        user_id,
        UserRole.MANAGER,
    )
    mobile_service.save_menu.assert_called_once()


def test_get_photo_returns_bytes(
    mobile_client,
    mobile_service,
    store_id,
    menu_item_id,
):
    mobile_service.get_photo.return_value = SimpleNamespace(
        data=b"\x89PNG\r\n\x1a\nphoto",
        content_type="image/png",
    )

    response = mobile_client.get(
        f"/stores/{store_id}/menu/items/{menu_item_id}/photo"
    )

    assert response.status_code == 200
    assert response.content == b"\x89PNG\r\n\x1a\nphoto"
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "public, max-age=300"


def test_put_photo_passes_raw_bytes(
    mobile_client,
    mobile_service,
    mobile_authorize,
    store_id,
    user_id,
    menu_item_id,
    menu_response,
):
    mobile_service.put_photo.return_value = menu_response
    content = b"\x89PNG\r\n\x1a\nphoto"

    response = mobile_client.put(
        f"/stores/{store_id}/menu/items/{menu_item_id}/photo"
        f"?actor_id={user_id}",
        content=content,
    )

    assert response.status_code == 200
    mobile_authorize.assert_called_once_with(
        ANY,
        store_id,
        user_id,
        UserRole.MANAGER,
    )
    mobile_service.put_photo.assert_called_once_with(
        store_id,
        menu_item_id,
        content,
    )


def test_delete_photo_requires_manager(
    mobile_client,
    mobile_service,
    mobile_authorize,
    store_id,
    user_id,
    menu_item_id,
    menu_response,
):
    mobile_service.delete_photo.return_value = menu_response

    response = mobile_client.delete(
        f"/stores/{store_id}/menu/items/{menu_item_id}/photo"
        f"?actor_id={user_id}"
    )

    assert response.status_code == 200
    mobile_authorize.assert_called_once_with(
        ANY,
        store_id,
        user_id,
        UserRole.MANAGER,
    )
    mobile_service.delete_photo.assert_called_once_with(
        store_id,
        menu_item_id,
    )


@pytest.mark.parametrize(
    "path,method",
    [
        ("/stores/not-a-uuid/menu/public", "get"),
        ("/stores/not-a-uuid/car/public", "get"),
        ("/stores/not-a-uuid/mobile-orders?actor_id=00000000-0000-0000-0000-000000000001", "get"),
        ("/stores/00000000-0000-0000-0000-000000000001/menu?actor_id=not-a-uuid", "get"),
    ],
)
def test_mobile_routes_reject_invalid_uuids(
    mobile_client,
    mobile_service,
    path,
    method,
):
    response = getattr(mobile_client, method)(path)
    assert response.status_code == 422
