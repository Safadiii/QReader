"""Shared pytest fixtures for Store, QR, Orders, Notifications, Auth, Team, Screens, Mobile, and Loyalty API tests."""

import importlib
import os
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, Mock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _import_routes(env_name: str, default: str):
    module_name = os.getenv(env_name, default)
    try:
        return importlib.import_module(module_name)
    except ModuleNotFoundError as exc:
        pytest.fail(
            f"Could not import {module_name!r}: {exc}. "
            f"Set {env_name} to the correct dotted import path."
        )


@pytest.fixture(scope="session")
def store_routes():
    return _import_routes("STORE_ROUTES_MODULE", "modules.stores.routes")


@pytest.fixture(scope="session")
def qr_routes():
    return _import_routes("QR_ROUTES_MODULE", "modules.qr.routes")


@pytest.fixture(scope="session")
def order_routes():
    return _import_routes("ORDER_ROUTES_MODULE", "modules.orders.routes")


@pytest.fixture(scope="session")
def notification_routes():
    return _import_routes(
        "NOTIFICATION_ROUTES_MODULE",
        "modules.notifications.routes",
    )


@pytest.fixture(scope="session")
def auth_routes():
    return _import_routes("AUTH_ROUTES_MODULE", "modules.auth.routes")


@pytest.fixture(scope="session")
def team_routes():
    return _import_routes("TEAM_ROUTES_MODULE", "modules.team.routes")


@pytest.fixture(scope="session")
def screen_routes():
    return _import_routes("SCREEN_ROUTES_MODULE", "modules.screens.routes")


@pytest.fixture(scope="session")
def mobile_routes():
    return _import_routes("MOBILE_ROUTES_MODULE", "modules.mobile.routes")


@pytest.fixture(scope="session")
def mobile_schemas():
    return _import_routes("MOBILE_SCHEMAS_MODULE", "modules.mobile.schemas")


@pytest.fixture(scope="session")
def mobile_services():
    return _import_routes("MOBILE_SERVICES_MODULE", "modules.mobile.services")


@pytest.fixture(scope="session")
def loyalty_routes():
    return _import_routes("LOYALTY_ROUTES_MODULE", "modules.loyalty.routes")


@pytest.fixture(scope="session")
def loyalty_schemas():
    return _import_routes("LOYALTY_SCHEMAS_MODULE", "modules.loyalty.schemas")


@pytest.fixture(scope="session")
def loyalty_services():
    return _import_routes("LOYALTY_SERVICES_MODULE", "modules.loyalty.services")


@pytest.fixture
def app(
    store_routes,
    qr_routes,
    order_routes,
    notification_routes,
    auth_routes,
    team_routes,
    screen_routes,
    mobile_routes,
    loyalty_routes,
):
    """ASGI app containing all routers currently covered by the shared test suite."""
    application = FastAPI()
    application.include_router(store_routes.router)
    application.include_router(qr_routes.router)
    application.include_router(order_routes.router)
    application.include_router(notification_routes.router)
    application.include_router(auth_routes.router)
    application.include_router(team_routes.router)
    application.include_router(screen_routes.router)
    application.include_router(mobile_routes.router)
    application.include_router(loyalty_routes.router)
    return application


@pytest.fixture
def client(
    app,
    store_routes,
    qr_routes,
    order_routes,
    notification_routes,
    auth_routes,
    team_routes,
    screen_routes,
    mobile_routes,
    loyalty_routes,
):
    """Route/validation client with dummy DB dependencies.

    Each module's service constructor is mocked by its module-specific service fixture.
    """
    dummy_db = object()
    application_overrides = app.dependency_overrides
    application_overrides[store_routes.get_db] = lambda: dummy_db
    application_overrides[qr_routes.get_db] = lambda: dummy_db
    application_overrides[order_routes.get_db] = lambda: dummy_db
    application_overrides[notification_routes.get_db] = lambda: dummy_db
    application_overrides[auth_routes.get_db] = lambda: dummy_db
    application_overrides[team_routes.get_db] = lambda: dummy_db
    application_overrides[screen_routes.get_db] = lambda: dummy_db
    application_overrides[mobile_routes.get_db] = lambda: dummy_db
    application_overrides[loyalty_routes.get_db] = lambda: dummy_db

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


# ---------------------------
# Store fixtures
# ---------------------------

@pytest.fixture
def service(store_routes, monkeypatch):
    """Mock StoreService. Name kept for existing Store tests."""
    instance = Mock()
    monkeypatch.setattr(store_routes, "StoreService", Mock(return_value=instance))
    return instance


@pytest.fixture
def store_id():
    return uuid4()


def settings_response(store_id, name="Demo Store", **updates):
    data = {
        "store_id": str(store_id),
        "name": name,
        "default_language": "tr",
        "alert_sound": "pager",
        "ask_rating": True,
        "google_min_stars": 4,
        "theme": "graphite",
        "links": {},
        "assets": {},
    }
    data.update(updates)
    return data


# ---------------------------
# QR fixtures
# ---------------------------

@pytest.fixture
def qr_service(qr_routes, monkeypatch):
    """Mock QRService without colliding with Store's `service` fixture."""
    instance = MagicMock()
    monkeypatch.setattr(qr_routes, "QRService", MagicMock(return_value=instance))
    return instance


@pytest.fixture
def order_id():
    return uuid4()


@pytest.fixture
def qr_response(order_id):
    now = datetime.now(timezone.utc)
    return {
        "id": str(uuid4()),
        "order_id": str(order_id),
        "tracking_url": "http://localhost:3000/track/test-token",
        "created_at": now.isoformat(),
        "expires_at": now.isoformat(),
        "revoked_at": None,
        "scanned_at": None,
        "is_active": True,
    }


@pytest.fixture
def public_response():
    return {
        "store_name": "Demo Store",
        "order_number": 42,
        "status": "pending",
        "ready_at": None,
        "customer_coming_at": None,
        "customer_seen_at": None,
        "ring_requested_at": None,
        "rating": None,
        "design": {
            "store_id": str(uuid4()),
            "name": "Demo Store",
            "default_language": "tr",
            "alert_sound": "pager",
            "alert_title_tr": None,
            "alert_text_tr": None,
            "alert_title_en": None,
            "alert_text_en": None,
            "ask_rating": True,
            "google_min_stars": 4,
            "google_review_url": None,
            "theme": "graphite",
            "brand_color": None,
            "card_color": None,
            "number_color": None,
            "links": {},
            "banner_url": None,
            "assets": {},
        },
    }


# ---------------------------
# Orders fixtures
# ---------------------------

@pytest.fixture
def order_service(order_routes, monkeypatch):
    """Mock OrderService and background delivery for route/validation tests."""
    instance = MagicMock()
    monkeypatch.setattr(order_routes, "OrderService", MagicMock(return_value=instance))
    monkeypatch.setattr(order_routes, "deliver_for_order", MagicMock())
    return instance


@pytest.fixture
def order_response(store_id, order_id):
    now = datetime.now(timezone.utc)
    return {
        "id": str(order_id),
        "store_id": str(store_id),
        "order_number": 1,
        "order_date": date.today().isoformat(),
        "status": "pending",
        "created_at": now.isoformat(),
        "ready_at": None,
        "completed_at": None,
        "customer_coming_at": None,
        "customer_seen_at": None,
        "scanned_at": None,
        "ring_requested_at": None,
    }


@pytest.fixture
def analytics_response():
    return {
        "days": 30,
        "orders": 0,
        "collected": 0,
        "cancelled": 0,
        "scanned": 0,
        "customers_coming": 0,
        "avg_prep_seconds": None,
        "avg_pickup_seconds": None,
        "avg_rating": None,
        "ratings": 0,
        "per_day": [],
        "per_hour": [],
        "prep_by_hour": [
            {"hour": hour, "avg_prep_seconds": None} for hour in range(24)
        ],
    }


# ---------------------------
# Notifications fixtures
# ---------------------------

@pytest.fixture
def notification_service(notification_routes, monkeypatch):
    """Mock NotificationService without colliding with other service fixtures."""
    instance = MagicMock()
    monkeypatch.setattr(
        notification_routes,
        "NotificationService",
        MagicMock(return_value=instance),
    )
    return instance


@pytest.fixture
def notification_config_response():
    return {
        "vapid_public_key": "test-vapid-public-key",
        "apns_configured": True,
    }


@pytest.fixture
def subscribe_response():
    expires = datetime.now(timezone.utc)
    return {
        "subscribed": True,
        "expires_at": expires.isoformat(),
    }


@pytest.fixture
def apns_subscription_payload():
    return {
        "provider": "apns",
        "device_token": "a" * 64,
        "environment": "sandbox",
    }


@pytest.fixture
def web_push_subscription_payload():
    return {
        "provider": "web_push",
        "endpoint": "https://fcm.googleapis.com/fcm/send/test-subscription",
        "p256dh": "p" * 32,
        "auth": "a" * 16,
        "platform": "android",
    }


# ---------------------------
# Auth fixtures
# ---------------------------

@pytest.fixture
def auth_service(auth_routes, monkeypatch):
    """Mock AuthService without colliding with any other module's service fixture."""
    instance = MagicMock()
    monkeypatch.setattr(
        auth_routes,
        "AuthService",
        MagicMock(return_value=instance),
    )
    return instance


@pytest.fixture
def user_id():
    return uuid4()


@pytest.fixture
def staff_response(user_id, store_id):
    return {
        "id": str(user_id),
        "store_id": str(store_id),
        "store_name": "Demo Store",
        "name": "Test Owner",
        "phone": "+9613123456",
        "role": "owner",
    }


@pytest.fixture
def signup_payload():
    return {
        "store_name": "Demo Store",
        "name": "Test Owner",
        "phone": "+961 3 123-456",
        "password": "strong-password-123",
        "timezone": "Asia/Beirut",
    }


# ---------------------------
# Team fixtures
# ---------------------------

@pytest.fixture
def team_service(team_routes, monkeypatch):
    """Mock TeamService without colliding with any other module's service fixture."""
    instance = MagicMock()
    monkeypatch.setattr(
        team_routes,
        "TeamService",
        MagicMock(return_value=instance),
    )
    return instance


@pytest.fixture
def team_member_id():
    return uuid4()


@pytest.fixture
def team_member_response(team_member_id):
    return {
        "id": str(team_member_id),
        "name": "Team Member",
        "phone": "+9613555000",
        "role": "staff",
        "is_owner": False,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


@pytest.fixture
def member_with_password_response(team_member_response):
    return {
        "member": team_member_response,
        "temporary_password": "TempPass23",
    }


# ---------------------------
# Screens fixtures
# ---------------------------

@pytest.fixture
def screen_db():
    """Mock SQLAlchemy Session for Screens route-level tests."""
    return MagicMock()


@pytest.fixture
def screen_authorize(screen_routes, monkeypatch):
    """Mock require_actor so route tests can focus on Screens behavior."""
    authorize = MagicMock()
    monkeypatch.setattr(screen_routes, "require_actor", authorize)
    return authorize


@pytest.fixture
def screen_client(app, screen_routes, screen_db, screen_authorize):
    """Client for Screens routes using a Session-shaped mock instead of dummy object()."""
    app.dependency_overrides[screen_routes.get_db] = lambda: screen_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


# ---------------------------
# Mobile orders/menu fixtures
# ---------------------------

@pytest.fixture
def mobile_service(mobile_routes, monkeypatch):
    """Mock MobileService for route-level tests."""
    instance = MagicMock()
    monkeypatch.setattr(
        mobile_routes,
        "MobileService",
        MagicMock(return_value=instance),
    )
    return instance


@pytest.fixture
def mobile_qr_service(mobile_routes, monkeypatch):
    """Mock the QRService used by public delivery routes."""
    instance = MagicMock()
    monkeypatch.setattr(
        mobile_routes,
        "QRService",
        MagicMock(return_value=instance),
    )
    return instance


@pytest.fixture
def mobile_authorize(mobile_routes, monkeypatch):
    """Mock staff authorization for route-level Mobile tests."""
    authorize = MagicMock()
    monkeypatch.setattr(mobile_routes, "require_actor", authorize)
    return authorize


@pytest.fixture
def mobile_client(
    app,
    mobile_routes,
    mobile_service,
    mobile_qr_service,
    mobile_authorize,
):
    """Route client with all Mobile route dependencies isolated."""
    db = MagicMock()
    app.dependency_overrides[mobile_routes.get_db] = lambda: db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def mobile_settings_response(store_id):
    return {
        "store_id": str(store_id),
        "enabled": True,
        "collect_enabled": True,
        "car_enabled": True,
        "table_enabled": True,
        "table_count": 12,
        "hours_mode": "always",
        "opens": "08:00",
        "closes": "22:00",
    }


@pytest.fixture
def delivery_state_response():
    return {
        "available": True,
        "collect": True,
        "car": True,
        "table": True,
        "mode": None,
        "car_plate": None,
        "car_note": None,
        "car_color": None,
        "car_model": None,
        "table_label": None,
    }


@pytest.fixture
def menu_item_id():
    return uuid4()


@pytest.fixture
def menu_response(store_id, menu_item_id):
    return {
        "store_id": str(store_id),
        "enabled": True,
        "currency": "₺",
        "note": "Fresh today",
        "items": [
            {
                "id": str(menu_item_id),
                "category": "Coffee",
                "name": "Latte",
                "description": "Milk coffee",
                "price_cents": 25000,
                "available": True,
                "has_photo": False,
            }
        ],
    }


@pytest.fixture
def public_menu_response(menu_item_id):
    return {
        "ordering": {
            "available": True,
            "collect": True,
            "car": True,
            "table": True,
        },
        "store_name": "Demo Store",
        "enabled": True,
        "currency": "₺",
        "note": "Fresh today",
        "items": [
            {
                "id": str(menu_item_id),
                "category": "Coffee",
                "name": "Latte",
                "description": "Milk coffee",
                "price_cents": 25000,
                "available": True,
                "has_photo": False,
            }
        ],
    }


@pytest.fixture
def placed_order_response():
    return {
        "token": "public-tracking-token",
        "order_number": 1001,
        "total_cents": 50000,
    }


@pytest.fixture
def car_page_response():
    return {
        "store_name": "Demo Store",
        "available": True,
        "menu_url_enabled": True,
    }


@pytest.fixture
def delivery_list_response():
    return {"items": []}


# ---------------------------
# Loyalty fixtures
# ---------------------------

@pytest.fixture
def loyalty_service(loyalty_routes, monkeypatch):
    """Mock LoyaltyService for route/validation tests."""
    instance = MagicMock()
    monkeypatch.setattr(
        loyalty_routes,
        "LoyaltyService",
        MagicMock(return_value=instance),
    )
    return instance


@pytest.fixture
def loyalty_qr_service(loyalty_routes, monkeypatch):
    """Mock the QRService used by customer Loyalty routes."""
    instance = MagicMock()
    monkeypatch.setattr(
        loyalty_routes,
        "QRService",
        MagicMock(return_value=instance),
    )
    return instance


@pytest.fixture
def loyalty_authorize(loyalty_routes, monkeypatch):
    """Mock require_actor for staff Loyalty route tests."""
    authorize = MagicMock()
    monkeypatch.setattr(loyalty_routes, "require_actor", authorize)
    return authorize


@pytest.fixture
def loyalty_client(
    app,
    loyalty_routes,
    loyalty_service,
    loyalty_qr_service,
    loyalty_authorize,
):
    """Loyalty route client with QR, auth, service, and DB dependencies isolated."""
    db = MagicMock()
    app.dependency_overrides[loyalty_routes.get_db] = lambda: db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def loyalty_card_state():
    return {
        "enabled": True,
        "goal": 10,
        "reward_name": "Free coffee",
        "code": "ABCD2345",
        "stamps": 2,
        "pending": 1,
        "reward_ready": False,
        "rewards_redeemed": 0,
        "this_order": "pending",
        "phone_saved": False,
        "phone_hint": "",
    }


@pytest.fixture
def loyalty_program_response(store_id):
    return {
        "store_id": str(store_id),
        "enabled": True,
        "stamps_required": 10,
        "reward_name": "Free coffee",
    }


@pytest.fixture
def loyalty_stats_response():
    return {
        "enabled": True,
        "cards": 2,
        "stamps_given": 8,
        "stamps_pending": 1,
        "rewards_redeemed": 1,
        "rewards_waiting": 1,
        "cards_with_phone": 1,
        "new_cards_30d": 2,
        "recent": [],
    }


@pytest.fixture
def loyalty_waiting_response(order_id):
    return {"order_ids": [str(order_id)]}
