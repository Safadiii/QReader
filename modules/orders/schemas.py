import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from database.schema import OrderStatus

class OrderCreate(BaseModel):
    store_id: uuid.UUID
    order_number: int

class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    store_id: uuid.UUID
    order_number: int
    order_date: date
    status: OrderStatus
    created_at: datetime