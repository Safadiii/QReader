from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.init_db import get_db
from .schemas import PushConfig, SubscribeBody, SubscribeResponse
from .services import NotificationService

router = APIRouter(tags=["Notifications"])


@router.get("/push/config", response_model=PushConfig)
def push_config(db: Session = Depends(get_db)):
    return NotificationService(db).config()


@router.post("/track/{token}/subscribe", response_model=SubscribeResponse)
def subscribe(token: str, body: SubscribeBody, db: Session = Depends(get_db)):
    """The customer's phone asks to be notified about its order."""
    return NotificationService(db).subscribe(token, body)
