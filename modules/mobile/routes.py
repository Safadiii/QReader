from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from database.init_db import get_db
from database.schema import UserRole
from modules.auth.permissions import require_actor
from modules.qr.services import QRService

from .schemas import (
    CarOrder,
    CarPage,
    DeliveryBody,
    DeliveryList,
    DeliveryState,
    MenuBody,
    MenuResponse,
    MobileSettings,
    MobileSettingsResponse,
    PlaceOrder,
    PlacedOrder,
    PublicMenu,
)
from .services import MobileService

router = APIRouter(tags=["Mobile orders and menu"])


def _private(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"


# --- Customer's phone ------------------------------------------------------------------------

@router.get("/track/{token}/delivery", response_model=DeliveryState)
def get_delivery(token: str, response: Response, db: Session = Depends(get_db)):
    _private(response)
    _, order = QRService(db)._resolve(token)
    return MobileService(db).state(order)


@router.post("/track/{token}/delivery", response_model=DeliveryState)
def choose_delivery(token: str, body: DeliveryBody, response: Response, db: Session = Depends(get_db)):
    _private(response)
    _, order = QRService(db)._resolve(token)
    return MobileService(db).choose(order, body)


@router.get("/stores/{store_id}/menu/public", response_model=PublicMenu)
def public_menu(store_id: UUID, db: Session = Depends(get_db)):
    return MobileService(db).public_menu(store_id)


@router.post("/stores/{store_id}/menu/order", response_model=PlacedOrder)
def place_order(store_id: UUID, body: PlaceOrder, db: Session = Depends(get_db)):
    """A customer sends their order from the menu on their phone."""
    return MobileService(db).place_order(store_id, body)


@router.get("/stores/{store_id}/car/public", response_model=CarPage)
def car_page(store_id: UUID, db: Session = Depends(get_db)):
    return MobileService(db).car_page(store_id)


@router.post("/stores/{store_id}/car/order", response_model=PlacedOrder)
def car_order(store_id: UUID, body: CarOrder, db: Session = Depends(get_db)):
    """The car page: a customer sends what they want, their car, and their order number if they have one."""
    return MobileService(db).car_order(store_id, body)


# --- Staff -----------------------------------------------------------------------------------

@router.get("/stores/{store_id}/mobile-orders", response_model=MobileSettingsResponse)
def get_mobile(store_id: UUID, actor_id: UUID, db: Session = Depends(get_db)):
    require_actor(db, store_id, actor_id, UserRole.STAFF)
    return MobileService(db).get_settings(store_id)


@router.put("/stores/{store_id}/mobile-orders", response_model=MobileSettingsResponse)
def save_mobile(store_id: UUID, actor_id: UUID, body: MobileSettings, db: Session = Depends(get_db)):
    require_actor(db, store_id, actor_id, UserRole.MANAGER)
    return MobileService(db).save_settings(store_id, body)


@router.get("/stores/{store_id}/deliveries", response_model=DeliveryList)
def get_deliveries(store_id: UUID, actor_id: UUID, db: Session = Depends(get_db)):
    require_actor(db, store_id, actor_id, UserRole.STAFF)
    return MobileService(db).deliveries(store_id)


@router.get("/stores/{store_id}/menu", response_model=MenuResponse)
def get_menu(store_id: UUID, actor_id: UUID, db: Session = Depends(get_db)):
    require_actor(db, store_id, actor_id, UserRole.STAFF)
    return MobileService(db).get_menu(store_id)


@router.put("/stores/{store_id}/menu", response_model=MenuResponse)
def save_menu(store_id: UUID, actor_id: UUID, body: MenuBody, db: Session = Depends(get_db)):
    require_actor(db, store_id, actor_id, UserRole.MANAGER)
    return MobileService(db).save_menu(store_id, body)


@router.get("/stores/{store_id}/menu/items/{item_id}/photo", response_class=Response)
def get_photo(store_id: UUID, item_id: UUID, db: Session = Depends(get_db)):
    photo = MobileService(db).get_photo(store_id, item_id)
    return Response(content=photo.data, media_type=photo.content_type, headers={"Cache-Control": "public, max-age=300"})


@router.put("/stores/{store_id}/menu/items/{item_id}/photo", response_model=MenuResponse)
async def put_photo(store_id: UUID, item_id: UUID, actor_id: UUID, request: Request, db: Session = Depends(get_db)):
    require_actor(db, store_id, actor_id, UserRole.MANAGER)
    return MobileService(db).put_photo(store_id, item_id, await request.body())


@router.delete("/stores/{store_id}/menu/items/{item_id}/photo", response_model=MenuResponse)
def delete_photo(store_id: UUID, item_id: UUID, actor_id: UUID, db: Session = Depends(get_db)):
    require_actor(db, store_id, actor_id, UserRole.MANAGER)
    return MobileService(db).delete_photo(store_id, item_id)
