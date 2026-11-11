import uuid
from uuid import UUID
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from database.schema import OrderStatus

class OrderCreate(BaseModel):
    store_id: uuid.UUID
    order_number: int = Field(gt=0)

class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    store_id: uuid.UUID
    order_number: int
    order_date: date
    status: OrderStatus
    created_at: datetime
    ready_at: datetime | None = None
    completed_at: datetime | None = None
    customer_coming_at: datetime | None = None

class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderStatusHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_id: UUID
    previous_status: OrderStatus | None
    new_status: OrderStatus
    changed_by: UUID | None
    created_at: datetime
