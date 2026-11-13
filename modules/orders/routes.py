import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from database.init_db import get_db

from .schemas import AnalyticsResponse, OrderCreate, OrderResponse, OrderStatusUpdate
from .services import OrderService
from modules.notifications.services import deliver_for_order


router = APIRouter(
    prefix="/orders",
    tags=["Orders"],
)


@router.post("/", response_model=OrderResponse, status_code=status.HTTP_201_CREATED,)
def create_order(data: OrderCreate, db: Session = Depends(get_db)):
    service = OrderService(db)
    return service.create_order(data)


@router.get("/", response_model=list[OrderResponse],)
def get_orders(store_id: uuid.UUID, db: Session = Depends(get_db)):
    service = OrderService(db)
    return service.get_orders(store_id)


# Declared before "/{order_id}" so "analytics" is not read as an order id.
@router.get("/analytics", response_model=AnalyticsResponse)
def get_analytics(
    store_id: uuid.UUID,
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    service = OrderService(db)
    return service.analytics(store_id, days)


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(order_id: uuid.UUID, db: Session = Depends(get_db)):
    service = OrderService(db)
    return service.get_order(order_id)


@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: uuid.UUID,
    data: OrderStatusUpdate,
    background: BackgroundTasks,
    store_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
):
    service = OrderService(db)
    order = service.update_status(order_id=order_id, new_status=data.status, store_id=store_id)
    # Pushes go out after the response, so a slow push service never delays the kitchen.
    background.add_task(deliver_for_order, order.id)
    return order


@router.post("/{order_id}/ring", response_model=OrderResponse)
def ring_again(
    order_id: uuid.UUID,
    background: BackgroundTasks,
    store_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
):
    """Staff: ring the customer's phone again for an order that is ready."""
    service = OrderService(db)
    order = service.ring_again(order_id, store_id=store_id)
    background.add_task(deliver_for_order, order.id)
    return order
