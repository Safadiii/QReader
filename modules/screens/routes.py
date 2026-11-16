"""Links for the iPad at the till and the TV in the shop. They carry an unguessable token
instead of a sign-in, so a device can be opened once and left running."""

import secrets
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from database.init_db import get_db
from database.schema import Store, UserRole
from modules.auth.permissions import require_actor

router = APIRouter(tags=["Screens"])

Kind = Literal["display", "waiting"]


class ScreenLinks(BaseModel):
    display_token: str
    waiting_token: str


class ScreenTarget(BaseModel):
    store_id: UUID
    store_name: str
    kind: Kind


def _token() -> str:
    return secrets.token_urlsafe(24)


@router.get("/stores/{store_id}/screens", response_model=ScreenLinks)
def get_links(store_id: UUID, actor_id: UUID, db: Session = Depends(get_db)):
    require_actor(db, store_id, actor_id, UserRole.MANAGER)
    store = db.get(Store, store_id)
    if store is None:
        raise HTTPException(status_code=404, detail="Store not found")
    # Issued the first time they are asked for.
    store.display_token = store.display_token or _token()
    store.waiting_token = store.waiting_token or _token()
    db.commit()
    return ScreenLinks(display_token=store.display_token, waiting_token=store.waiting_token)


@router.post("/stores/{store_id}/screens/{kind}/regenerate", response_model=ScreenLinks)
def regenerate(store_id: UUID, kind: Kind, actor_id: UUID, db: Session = Depends(get_db)):
    """Use when a device is lost or a link leaks: the old link stops working at once."""
    require_actor(db, store_id, actor_id, UserRole.MANAGER)
    store = db.get(Store, store_id)
    if store is None:
        raise HTTPException(status_code=404, detail="Store not found")
    store.display_token = store.display_token or _token()
    store.waiting_token = store.waiting_token or _token()
    setattr(store, f"{kind}_token", _token())
    db.commit()
    return ScreenLinks(display_token=store.display_token, waiting_token=store.waiting_token)


@router.get("/screens/{token}", response_model=ScreenTarget)
def resolve(token: str, db: Session = Depends(get_db)):
    """Which store and screen a link belongs to. Unknown or replaced links are a plain 404."""
    if not token or len(token) > 64:
        raise HTTPException(status_code=404, detail="Screen not found")
    store = db.scalar(select(Store).where(or_(Store.display_token == token, Store.waiting_token == token)))
    if store is None:
        raise HTTPException(status_code=404, detail="Screen not found")
    kind: Kind = "display" if store.display_token == token else "waiting"
    return ScreenTarget(store_id=store.id, store_name=store.name, kind=kind)
