import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from database.init_db import get_db

from .schemas import OrderCreate, OrderResponse
from .services import OrderService


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


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(order_id: uuid.UUID, db: Session = Depends(get_db)):
    service = OrderService(db)
    return service.get_order(order_id)
