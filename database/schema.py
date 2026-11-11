# SCHEMA FOR DATABASE TABLES AND RELATIONSHIPS

import uuid
from datetime import date, datetime


from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


from enum import Enum
from sqlalchemy import Enum as SQLEnum

# Allowed application values (persisted as lowercase PostgreSQL enum labels).
class UserRole(str, Enum):
    ADMIN = "admin"
    CASHIER = "cashier"


class OrderStatus(str, Enum):
    PENDING = "pending"
    PREPARING = "preparing"
    READY = "ready"
    COLLECTED = "collected"
    CANCELLED = "cancelled"


class Platform(str, Enum):
    IOS = "ios"
    ANDROID = "android"


class NotificationProvider(str, Enum):
    APNS = "apns"
    WEB_PUSH = "web_push"


class APNsEnvironment(str, Enum):
    SANDBOX = "sandbox"
    PRODUCTION = "production"


class NotificationStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class NotificationType(str, Enum):
    ORDER_READY = "order_ready"
    ORDER_CANCELLED = "order_cancelled"

class Base(DeclarativeBase):
    pass


# Register each native PostgreSQL ENUM once, shared by every column using it.
# SQLAlchemy normally persists member names (e.g. "PENDING"); values_callable
# ensures PostgreSQL stores the actual values (e.g. "pending").
def enum_values(enum_class):
    return [member.value for member in enum_class]


user_role_enum = SQLEnum(
    UserRole, name="user_role_enum", values_callable=enum_values,
    metadata=Base.metadata, native_enum=True,
)
order_status_enum = SQLEnum(
    OrderStatus, name="order_status_enum", values_callable=enum_values,
    metadata=Base.metadata, native_enum=True,
)
platform_enum = SQLEnum(
    Platform, name="platform_enum", values_callable=enum_values,
    metadata=Base.metadata, native_enum=True,
)
notification_provider_enum = SQLEnum(
    NotificationProvider, name="notification_provider_enum",
    values_callable=enum_values, metadata=Base.metadata, native_enum=True,
)
apns_environment_enum = SQLEnum(
    APNsEnvironment, name="apns_environment_enum",
    values_callable=enum_values, metadata=Base.metadata, native_enum=True,
)
notification_status_enum = SQLEnum(
    NotificationStatus, name="notification_status_enum",
    values_callable=enum_values, metadata=Base.metadata, native_enum=True,
)
notification_type_enum = SQLEnum(
    NotificationType, name="notification_type_enum",
    values_callable=enum_values, metadata=Base.metadata, native_enum=True,
)


class Store(Base):
    __tablename__ = "stores"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, server_default=text("'Asia/Beirut'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )

    users: Mapped[list["User"]] = relationship(back_populates="store")
    orders: Mapped[list["Order"]] = relationship(back_populates="store")


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stores.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[UserRole] = mapped_column(user_role_enum, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("TRUE")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )

    store: Mapped["Store"] = relationship(back_populates="users")
    created_orders: Mapped[list["Order"]] = relationship(
        back_populates="creator", foreign_keys="Order.created_by"
    )
    status_changes: Mapped[list["OrderStatusHistory"]] = relationship(
        back_populates="changed_by_user", foreign_keys="OrderStatusHistory.changed_by"
    )


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint(
            "store_id", "order_date", "order_number", name="uq_orders_store_date_number"
        ),
        CheckConstraint("order_number > 0", name="ck_orders_number_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stores.id"), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    order_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # Calculate this date using the store's timezone when creating an order.
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        order_status_enum,
        nullable=False,
        default=OrderStatus.PENDING,
        server_default=text("'pending'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set when the customer taps "I'm coming" on their phone after the order is ready.
    customer_coming_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    store: Mapped["Store"] = relationship(back_populates="orders")
    creator: Mapped["User | None"] = relationship(
        back_populates="created_orders", foreign_keys=[created_by]
    )
    qr_code: Mapped["QRCode | None"] = relationship(
        back_populates="order", uselist=False
    )
    status_history: Mapped[list["OrderStatusHistory"]] = relationship(
        back_populates="order"
    )
    notification_subscriptions: Mapped[list["NotificationSubscription"]] = relationship(
        back_populates="order"
    )
    notifications: Mapped[list["Notification"]] = relationship(back_populates="order")


class QRCode(Base):
    __tablename__ = "qr_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, unique=True
    )
    # Store a cryptographically random token, not the QR image or an order number.
    token: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # First time a customer opened the tracking link for the current token.
    scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped["Order"] = relationship(back_populates="qr_code")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False
    )
    previous_status: Mapped[OrderStatus | None] = mapped_column(order_status_enum)
    new_status: Mapped[OrderStatus] = mapped_column(order_status_enum, nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )

    order: Mapped["Order"] = relationship(back_populates="status_history")
    changed_by_user: Mapped["User | None"] = relationship(
        back_populates="status_changes", foreign_keys=[changed_by]
    )
    notifications: Mapped[list["Notification"]] = relationship(
        back_populates="status_event"
    )


class NotificationSubscription(Base):
    __tablename__ = "notification_subscriptions"
    __table_args__ = (
        CheckConstraint(
            "("
            "  provider = 'apns' AND platform = 'ios' "
            "  AND device_token IS NOT NULL AND apns_environment IS NOT NULL "
            "  AND endpoint IS NULL AND p256dh IS NULL AND auth_secret IS NULL"
            ") OR ("
            "  provider = 'web_push' "
            "  AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth_secret IS NOT NULL "
            "  AND device_token IS NULL AND apns_environment IS NULL"
            ")",
            name="ck_subscriptions_provider_credentials",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False
    )
    platform: Mapped[Platform] = mapped_column(platform_enum, nullable=False)
    provider: Mapped[NotificationProvider] = mapped_column(
        notification_provider_enum, nullable=False
    )

    # iOS App Clip / APNs
    device_token: Mapped[str | None] = mapped_column(Text)
    apns_environment: Mapped[APNsEnvironment | None] = mapped_column(
        apns_environment_enum
    )

    # Android browser / Web Push (can also support compatible iOS web clients)
    endpoint: Mapped[str | None] = mapped_column(Text)
    p256dh: Mapped[str | None] = mapped_column(Text)
    auth_secret: Mapped[str | None] = mapped_column(Text)

    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("TRUE")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped["Order"] = relationship(back_populates="notification_subscriptions")
    notifications: Mapped[list["Notification"]] = relationship(
        back_populates="subscription"
    )


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint(
            "status_event_id", "subscription_id", "type",
            name="uq_notifications_event_subscription_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notification_subscriptions.id", ondelete="SET NULL")
    )
    status_event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("order_status_history.id")
    )
    type: Mapped[NotificationType] = mapped_column(
        notification_type_enum, nullable=False
    )
    status: Mapped[NotificationStatus] = mapped_column(
        notification_status_enum,
        nullable=False,
        default=NotificationStatus.PENDING,
        server_default=text("'pending'"),
    )
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("NOW()")
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped["Order"] = relationship(back_populates="notifications")
    subscription: Mapped["NotificationSubscription | None"] = relationship(
        back_populates="notifications"
    )
    status_event: Mapped["OrderStatusHistory | None"] = relationship(
        back_populates="notifications"
    )


# Performance indexes. Unique constraints and primary keys create their own indexes.
Index("idx_orders_store_status", Order.store_id, Order.status)
Index("idx_orders_store_created", Order.store_id, Order.created_at.desc())
Index("idx_order_history_order", OrderStatusHistory.order_id, OrderStatusHistory.created_at.desc())
Index(
    "idx_subscriptions_order_active",
    NotificationSubscription.order_id,
    postgresql_where=NotificationSubscription.is_active.is_(True),
)
Index("idx_notifications_pending", Notification.created_at,
      postgresql_where=Notification.status == NotificationStatus.PENDING)
Index("idx_notifications_order", Notification.order_id, Notification.created_at.desc())
Index(
    "idx_apns_order_device",
    NotificationSubscription.order_id,
    NotificationSubscription.device_token,
    unique=True,
    postgresql_where=NotificationSubscription.provider == NotificationProvider.APNS,
)
Index(
    "idx_webpush_order_endpoint",
    NotificationSubscription.order_id,
    NotificationSubscription.endpoint,
    unique=True,
    postgresql_where=NotificationSubscription.provider == NotificationProvider.WEB_PUSH,
)
