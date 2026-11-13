from sqlalchemy.orm import Session
from sqlalchemy import select
from uuid import UUID

from modules.orders.repository import OrderRepository
from database.schema import Order, OrderRating, QRCode

class QRRepository:
    def __init__(self, db: Session):
        self.db = db

    # Reuse the orderrepo implementation rather than duplicating code
    def get_order(self, order_id: UUID) -> Order | None:
        repository = OrderRepository(self.db)
        return repository.get_by_id(order_id)

    def lock_order(self, order_id: UUID) -> Order | None:
        return self.db.scalar(select(Order).where(Order.id == order_id).with_for_update())

    def get_by_order_id(self, order_id: UUID) -> QRCode | None:
        return self.db.scalar(select(QRCode).where(QRCode.order_id == order_id))

    def get_by_token(self, token: str) -> QRCode | None:
        return self.db.scalar(select(QRCode).where(QRCode.token == token))

    def add(self, qr: QRCode) -> None:
        self.db.add(qr)
        self.db.flush()

    def get_rating(self, order_id: UUID) -> OrderRating | None:
        return self.db.scalar(select(OrderRating).where(OrderRating.order_id == order_id))
