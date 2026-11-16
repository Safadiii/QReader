from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from database.init_db import get_db
from database.schema import UserRole
from modules.auth.permissions import require_actor
from modules.qr.services import QRService

from .schemas import (
    CardLookup,
    CardState,
    DeviceBody,
    ProgramBody,
    PhoneBody,
    ProgramResponse,
    RestoreBody,
    StatsResponse,
    WaitingResponse,
)
from .services import LoyaltyService

router = APIRouter(tags=["Loyalty"])


# --- Customer's phone (the order's token is the key) -----------------------------------------

@router.post("/track/{token}/loyalty", response_model=CardState)
def claim_stamp(token: str, body: DeviceBody, response: Response, db: Session = Depends(get_db)):
    """The phone opened its order: returns its card, and records the stamp this order earns."""
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    _, order = QRService(db)._resolve(token)
    return LoyaltyService(db).claim(order, body.device)


@router.post("/track/{token}/loyalty/phone", response_model=CardState)
def save_phone(token: str, body: PhoneBody, response: Response, db: Session = Depends(get_db)):
    """Save the phone's card to a phone number and PIN, or sign in to the card saved to that number."""
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    _, order = QRService(db)._resolve(token)
    return LoyaltyService(db).save_phone(order, body.device, body.phone, body.pin)


@router.post("/track/{token}/loyalty/restore", response_model=CardState)
def restore_card(token: str, body: RestoreBody, response: Response, db: Session = Depends(get_db)):
    """A phone that lost its card claims it back with the card's code."""
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    _, order = QRService(db)._resolve(token)
    return LoyaltyService(db).restore(order, body.device, body.code)


# --- Staff -----------------------------------------------------------------------------------

@router.get("/stores/{store_id}/loyalty", response_model=ProgramResponse)
def get_program(store_id: UUID, actor_id: UUID, db: Session = Depends(get_db)):
    require_actor(db, store_id, actor_id, UserRole.STAFF)
    return LoyaltyService(db).get_program(store_id)


@router.put("/stores/{store_id}/loyalty", response_model=ProgramResponse)
def save_program(store_id: UUID, actor_id: UUID, body: ProgramBody, db: Session = Depends(get_db)):
    require_actor(db, store_id, actor_id, UserRole.MANAGER)
    return LoyaltyService(db).save_program(store_id, body)


@router.get("/stores/{store_id}/loyalty/stats", response_model=StatsResponse)
def get_stats(store_id: UUID, actor_id: UUID, db: Session = Depends(get_db)):
    require_actor(db, store_id, actor_id, UserRole.MANAGER)
    return LoyaltyService(db).stats(store_id)


@router.get("/stores/{store_id}/loyalty/waiting", response_model=WaitingResponse)
def get_waiting(store_id: UUID, actor_id: UUID, db: Session = Depends(get_db)):
    require_actor(db, store_id, actor_id, UserRole.STAFF)
    return LoyaltyService(db).waiting(store_id)


@router.get("/stores/{store_id}/loyalty/cards/{code}", response_model=CardLookup)
def look_up_card(store_id: UUID, code: str, actor_id: UUID, db: Session = Depends(get_db)):
    require_actor(db, store_id, actor_id, UserRole.STAFF)
    return LoyaltyService(db).lookup(store_id, code)


@router.post("/stores/{store_id}/loyalty/cards/{code}/redeem", response_model=CardState)
def redeem_by_code(store_id: UUID, code: str, actor_id: UUID, db: Session = Depends(get_db)):
    actor = require_actor(db, store_id, actor_id, UserRole.STAFF)
    return LoyaltyService(db).redeem_by_code(store_id, code, actor)


@router.post("/stores/{store_id}/loyalty/orders/{order_id}/redeem", response_model=CardState)
def redeem_for_order(store_id: UUID, order_id: UUID, actor_id: UUID, db: Session = Depends(get_db)):
    actor = require_actor(db, store_id, actor_id, UserRole.STAFF)
    return LoyaltyService(db).redeem_for_order(store_id, order_id, actor)
