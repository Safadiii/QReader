"""FastAPI routes. Add staff authentication to management routes before production."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from database.init_db import get_db
from .schemas import PublicOrderResponse, QRCodeResponse
from .services import QRService


router = APIRouter(tags=["QR Codes"])


@router.post("/orders/{order_id}/qr", response_model=QRCodeResponse)
def create_or_get_qr(order_id: UUID, db: Session = Depends(get_db)):
    return QRService(db).create_or_get(order_id)


@router.get("/orders/{order_id}/qr", response_model=QRCodeResponse)
def get_qr(order_id: UUID, db: Session = Depends(get_db)):
    return QRService(db).get_by_order(order_id)


@router.get("/orders/{order_id}/qr/image", response_class=Response)
def get_qr_image(
    order_id: UUID,
    format: Literal["png", "svg"] = "png",
    db: Session = Depends(get_db),
):
    data = QRService(db).get_image(order_id, format)
    media_type = "image/png" if format == "png" else "image/svg+xml"
    return Response(
        content=data,
        media_type=media_type,
        headers={"Cache-Control": "no-store"},
    )


@router.post("/orders/{order_id}/qr/rotate", response_model=QRCodeResponse)
def rotate_qr(order_id: UUID, db: Session = Depends(get_db)):
    return QRService(db).rotate(order_id)


@router.post("/orders/{order_id}/qr/revoke", response_model=QRCodeResponse)
def revoke_qr(order_id: UUID, db: Session = Depends(get_db)):
    return QRService(db).revoke(order_id)


@router.get("/track/{token}", response_model=PublicOrderResponse)
def track_order(token: str, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return QRService(db).track(token)
