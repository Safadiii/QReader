import uuid
from datetime import datetime, timezone
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

    def update_status(self, order_id: uuid.UUID, new_status: OrderStatus):
        #Defining the state machine for transitions
        transitions = {
            OrderStatus.PENDING: {
                OrderStatus.PREPARING,
                OrderStatus.CANCELLED,
            },
            OrderStatus.PREPARING: {
                OrderStatus.READY,
                OrderStatus.CANCELLED,
            },
            OrderStatus.READY: {
                OrderStatus.COLLECTED,
            },
            OrderStatus.COLLECTED: set(),
            OrderStatus.CANCELLED: set(),
        }

        try:
            order = self.repository.lock_order(order_id)

            if order is None:
                raise HTTPException(404, "Order not found")

            previous_status = order.status

            if new_status not in transitions[previous_status]:
                raise HTTPException(409, f"Cannot transition from {previous_status.value} to {new_status.value}")

            order.status = new_status
            now = datetime.now(timezone.utc)

            if new_status == OrderStatus.READY:
                order.ready_at = now

            elif new_status == OrderStatus.COLLECTED:
                order.completed_at = now

            history = OrderStatusHistory(
                order_id=order.id,
                previous_status=previous_status,
                new_status=new_status
            )

            self.repository.add_history(history)

            self.db.commit()
            self.db.refresh(order)

            return order
        except Exception:
            self.db.rollback()
            raise
