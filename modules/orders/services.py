import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database.schema import NotificationType, Order, OrderStatus, OrderStatusHistory
from modules.notifications.services import NotificationService

from .repository import OrderRepository
from .schemas import AnalyticsResponse, DayCount, HourStat, OrderCreate, PrepByHour

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

    def update_status(
        self, order_id: uuid.UUID, new_status: OrderStatus, store_id: uuid.UUID | None = None
    ):
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

            # With store_id given, another store's order looks like it does not exist.
            if order is None or (store_id is not None and order.store_id != store_id):
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

            # Queue pushes for the customer's devices in the same transaction.
            if new_status in (OrderStatus.READY, OrderStatus.CANCELLED):
                self.db.flush()  # gives the history row its id
                kind = (
                    NotificationType.ORDER_READY
                    if new_status == OrderStatus.READY
                    else NotificationType.ORDER_CANCELLED
                )
                NotificationService(self.db).enqueue(order, kind, history)

            self.db.commit()
            self.db.refresh(order)

            return order
        except Exception:
            self.db.rollback()
            raise

    def ring_again(self, order_id: uuid.UUID, store_id: uuid.UUID | None = None):
        try:
            order = self.repository.lock_order(order_id)
            if order is None or (store_id is not None and order.store_id != store_id):
                raise HTTPException(404, "Order not found")
            if order.status != OrderStatus.READY:
                raise HTTPException(409, "Only a ready order can be rung")
            order.ring_requested_at = datetime.now(timezone.utc)
            NotificationService(self.db).enqueue(order, NotificationType.ORDER_READY)
            self.db.commit()
            self.db.refresh(order)
            return order
        except Exception:
            self.db.rollback()
            raise

    def analytics(self, store_id: uuid.UUID, days: int) -> AnalyticsResponse:
        store = self.repository.get_store(store_id)
        if store is None:
            raise HTTPException(status_code=404, detail="Store not found")

        zone = ZoneInfo(store.timezone)
        today = datetime.now(zone).date()
        first_day = today - timedelta(days=days - 1)
        orders = self.repository.get_since(store_id, first_day)
        stars = self.repository.get_ratings_since(store_id, first_day)

        def average(values: list[float]) -> float | None:
            return sum(values) / len(values) if values else None

        per_day = {first_day + timedelta(days=i): 0 for i in range(days)}
        per_hour: dict[tuple[int, int], int] = defaultdict(int)
        prep_by_hour: dict[int, list[float]] = defaultdict(list)
        prep: list[float] = []
        pickup: list[float] = []

        for order in orders:
            if order.order_date in per_day:
                per_day[order.order_date] += 1
            local = order.created_at.astimezone(zone)
            per_hour[(local.weekday(), local.hour)] += 1
            if order.ready_at is not None:
                seconds = (order.ready_at - order.created_at).total_seconds()
                prep.append(seconds)
                prep_by_hour[local.hour].append(seconds)
            if order.ready_at is not None and order.completed_at is not None:
                pickup.append((order.completed_at - order.ready_at).total_seconds())

        return AnalyticsResponse(
            days=days,
            orders=len(orders),
            collected=sum(o.status == OrderStatus.COLLECTED for o in orders),
            cancelled=sum(o.status == OrderStatus.CANCELLED for o in orders),
            scanned=sum(o.scanned_at is not None for o in orders),
            customers_coming=sum(o.customer_coming_at is not None for o in orders),
            avg_prep_seconds=average(prep),
            avg_pickup_seconds=average(pickup),
            avg_rating=average([float(s) for s in stars]),
            ratings=len(stars),
            per_day=[DayCount(date=d, orders=n) for d, n in per_day.items()],
            per_hour=[
                HourStat(weekday=w, hour=h, orders=n) for (w, h), n in sorted(per_hour.items())
            ],
            prep_by_hour=[
                PrepByHour(hour=h, avg_prep_seconds=average(prep_by_hour.get(h, [])))
                for h in range(24)
            ],
        )
