import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
 
from database.schema import Order, OrderStatus, OrderStatusHistory

from .repository import OrderRepository
from .schemas import OrderCreate

class OrderService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = OrderRepository(db)

    def create_order(self, data: OrderCreate):
        store = self.repository.get_store(data.store_id)

        if store is None:
            raise HTTPException(status_code=404, detail="Store not found")

        if data.order_number <= 0:
            raise HTTPException(status_code=422, detail="Order number must be positive")

        order = Order(
            store_id=data.store_id,
            order_number=data.order_number,
            order_date=datetime.now(ZoneInfo(store.timezone)).date(),
            status=OrderStatus.PENDING
        )

        try:
            self.repository.add(order)

            history = OrderStatusHistory(
                order_id=order.id,
                previous_status=None,
                new_status=OrderStatus.PENDING
            )

            self.repository.add_history(history)

            self.db.commit()
            self.db.refresh(order)

        except IntegrityError:
            self.db.rollback()
            raise HTTPException(status_code=409, detail="Order Number already exists for this date")

        except Exception:
            self.db.rollback()
            raise

        return order

    def get_order(self, order_id: uuid.UUID):
        order = self.repository.get_by_id(order_id)

        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")

        return order

    def get_orders(self, store_id: uuid.UUID):
        return self.repository.get_all(store_id)