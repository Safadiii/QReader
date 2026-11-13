from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime

from database.schema import OrderStatus
from modules.stores.schemas import StoreSettingsResponse

class QRCodeResponse(BaseModel):
    id: UUID
    order_id: UUID
    tracking_url: str 
    created_at: datetime
    expires_at: datetime | None
    revoked_at: datetime | None
    scanned_at: datetime | None
    is_active: bool


class PublicOrderResponse(BaseModel):
    store_name: str
    order_number: int
    status: OrderStatus
    ready_at: datetime | None
    customer_coming_at: datetime | None
    ring_requested_at: datetime | None
    # The customer's own star rating, once given.
    rating: int | None
    # How the store wants the order page to look and behave.
    design: StoreSettingsResponse


class RatingBody(BaseModel):
    stars: int = Field(ge=1, le=5)