import uuid
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from database.schema import Store, Order, OrderStatusHistory

class OrderRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_store(self, store_id: uuid.UUID):
        return self.db.get(Store, store_id)

    def get_by_id(self, order_id: uuid.UUID) -> Order | None:
        return self.db.get(Order, order_id)

    def get_all(self, store_id: uuid.UUID):
        statement = (select(Order).where(Order.store_id == store_id)
                    .order_by(Order.created_at.desc()).limit(100))
        return self.db.scalars(statement).all()

    def add(self, order: Order):
        self.db.add(order)
        self.db.flush()
        return order

    def add_history(self, history: OrderStatusHistory):
        self.db.add(history)

    def lock_order(self, order_id: uuid.UUID) -> Order | None:
        return self.db.scalar(select(Order).where(Order.id == order_id).with_for_update())

    def get_history(self, order_id: UUID) -> list[OrderStatusHistory]:
        statement = (
            select(OrderStatusHistory)
            .where(OrderStatusHistory.order_id == order_id)
            .order_by(OrderStatusHistory.created_at.asc(), OrderStatusHistory.id.asc())
        )
        return list(self.db.scalars(statement).all())