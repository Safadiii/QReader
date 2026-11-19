import pytest
from pydantic import ValidationError


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("34 abc 123", "34ABC123"),
        ("34-ABC-123", "34ABC123"),
        (" 06 a 12 ", "06A12"),
    ],
)
def test_normalize_plate(mobile_schemas, raw, expected):
    assert mobile_schemas.normalize_plate(raw) == expected


@pytest.mark.parametrize(
    "value",
    ["08:00", "23:59", "00:00"],
)
def test_mobile_settings_accept_valid_times(mobile_schemas, value):
    body = mobile_schemas.MobileSettings(
        enabled=True,
        collect_enabled=True,
        car_enabled=False,
        table_enabled=False,
        table_count=0,
        hours_mode="always",
        opens=value,
        closes="22:00",
    )
    assert body.opens == value


@pytest.mark.parametrize("value", ["8:00", "24:00", "12:60", "noon"])
def test_mobile_settings_reject_bad_time(mobile_schemas, value):
    with pytest.raises(ValidationError):
        mobile_schemas.MobileSettings(
            enabled=True,
            collect_enabled=True,
            car_enabled=False,
            table_enabled=False,
            table_count=0,
            hours_mode="always",
            opens=value,
            closes="22:00",
        )


@pytest.mark.parametrize("mode", ["collect", "car", "table"])
def test_delivery_body_accepts_supported_modes(mobile_schemas, mode):
    body = mobile_schemas.DeliveryBody(mode=mode)
    assert body.mode == mode


def test_delivery_body_rejects_unknown_mode(mobile_schemas):
    with pytest.raises(ValidationError):
        mobile_schemas.DeliveryBody(mode="drone")


def test_place_order_requires_lines(mobile_schemas):
    with pytest.raises(ValidationError):
        mobile_schemas.PlaceOrder(
            mode="collect",
            lines=[],
        )


@pytest.mark.parametrize("qty", [0, 21])
def test_cart_line_quantity_bounds(mobile_schemas, qty):
    from uuid import uuid4
    with pytest.raises(ValidationError):
        mobile_schemas.CartLine(item_id=uuid4(), qty=qty)


@pytest.mark.parametrize("number", [0, 100000])
def test_car_order_number_bounds(mobile_schemas, number):
    with pytest.raises(ValidationError):
        mobile_schemas.CarOrder(
            order_number=number,
            car_plate="34ABC123",
        )


@pytest.mark.xfail(
    reason=(
        "MenuItemBody applies min_length before service-side whitespace normalization; "
        "a whitespace-only name currently validates"
    ),
    strict=True,
)
def test_menu_item_whitespace_only_name_is_rejected(mobile_schemas):
    with pytest.raises(ValidationError):
        mobile_schemas.MenuItemBody(
            name="   ",
            price_cents=100,
        )
