import re
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
# Turkish plate: province 01-81, one to three letters (no Q, W, X), two to four digits.
PLATE = re.compile(r"^(0[1-9]|[1-7]\d|8[01])[ABCDEFGHIJKLMNOPRSTUVYZ]{1,3}\d{2,4}$")


def normalize_plate(raw: str) -> str:
    return "".join(ch for ch in raw.upper() if ch.isalnum())


class MobileSettings(BaseModel):
    enabled: bool
    collect_enabled: bool
    car_enabled: bool
    table_enabled: bool
    table_count: int = Field(default=0, ge=0, le=200)
    hours_mode: str = Field(pattern="^(always|custom)$")
    opens: str
    closes: str

    @field_validator("opens", "closes")
    @classmethod
    def _time(cls, value: str) -> str:
        if not HHMM.match(value):
            raise ValueError("Use HH:MM")
        return value


class MobileSettingsResponse(MobileSettings):
    store_id: UUID


class DeliveryBody(BaseModel):
    mode: str = Field(pattern="^(collect|car|table)$")
    car_plate: str | None = Field(default=None, max_length=20)
    car_note: str | None = Field(default=None, max_length=60)
    car_color: str | None = Field(default=None, max_length=20)
    car_model: str | None = Field(default=None, max_length=40)
    table_label: str | None = Field(default=None, max_length=20)


class DeliveryState(BaseModel):
    """What the customer's phone needs: which ways are open, and what was chosen."""
    available: bool
    collect: bool
    car: bool
    table: bool
    mode: str | None = None
    car_plate: str | None = None
    car_note: str | None = None
    car_color: str | None = None
    car_model: str | None = None
    table_label: str | None = None


class LineOut(BaseModel):
    name: str
    qty: int


class DeliveryItem(BaseModel):
    order_id: UUID
    mode: str
    car_plate: str | None
    car_note: str | None
    car_color: str | None = None
    car_model: str | None = None
    table_label: str | None
    # Only for orders placed from the menu on a phone.
    phone_order: bool = False
    customer_name: str = ""
    note: str = ""
    total_cents: int = 0
    lines: list[LineOut] = []


class DeliveryList(BaseModel):
    items: list[DeliveryItem]


class MenuItemBody(BaseModel):
    id: UUID | None = None
    category: str = Field(default="", max_length=40)
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=200)
    price_cents: int = Field(ge=0, le=100_000_00)
    available: bool = True
    # Filled in by the server; ignored when sent.
    has_photo: bool = False


class MenuBody(BaseModel):
    enabled: bool
    currency: str = Field(default="₺", min_length=1, max_length=4)
    note: str = Field(default="", max_length=200)
    items: list[MenuItemBody] = Field(max_length=300)


class MenuResponse(MenuBody):
    store_id: UUID
    items: list[MenuItemBody]


class CartLine(BaseModel):
    item_id: UUID
    qty: int = Field(ge=1, le=20)


class PlaceOrder(DeliveryBody):
    customer_name: str = Field(default="", max_length=40)
    note: str = Field(default="", max_length=200)
    lines: list[CartLine] = Field(min_length=1, max_length=40)


class PlacedOrder(BaseModel):
    token: str
    order_number: int
    total_cents: int


class Ordering(BaseModel):
    available: bool
    collect: bool
    car: bool
    table: bool


class PublicMenu(BaseModel):
    ordering: Ordering
    store_name: str
    enabled: bool
    currency: str
    note: str
    items: list[MenuItemBody]


class CarOrder(BaseModel):
    """The car page: what the customer wants, their order number if they have one, and their car."""
    order_number: int | None = Field(default=None, ge=1, le=99999)
    what: str = Field(default="", max_length=300)
    customer_name: str = Field(default="", max_length=40)
    car_plate: str = Field(max_length=20)
    car_color: str | None = Field(default=None, max_length=20)
    car_model: str | None = Field(default=None, max_length=40)
    car_note: str | None = Field(default=None, max_length=60)


class CarPage(BaseModel):
    store_name: str
    available: bool
    menu_url_enabled: bool
