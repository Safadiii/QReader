from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

from database.schema import OrderStatus

class QRCodeResponse(BaseModel):
    id: UUID
    order_id: UUID
    tracking_url: str 
    created_at: datetime
    expires_at: datetime | None
    revoked_at: datetime | None
    is_active: bool


class PublicOrderResponse(BaseModel):
    order_number: int
    status: OrderStatus
    ready_at: datetime | None