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
    scanned_at: datetime | None = None
    ring_requested_at: datetime | None = None

class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class DayCount(BaseModel):
    date: date
    orders: int


class HourStat(BaseModel):
    """One hour of the week (weekday 0 = Monday) in the store's timezone."""
    weekday: int
    hour: int
    orders: int


class PrepByHour(BaseModel):
    hour: int
    avg_prep_seconds: float | None


class AnalyticsResponse(BaseModel):
    days: int
    orders: int
    collected: int
    cancelled: int
    scanned: int
    customers_coming: int
    avg_prep_seconds: float | None
    avg_pickup_seconds: float | None
    avg_rating: float | None
    ratings: int
    per_day: list[DayCount]
    per_hour: list[HourStat]
    prep_by_hour: list[PrepByHour]


class OrderStatusHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    order_id: UUID
    previous_status: OrderStatus | None
    new_status: OrderStatus
    changed_by: UUID | None
    created_at: datetime
