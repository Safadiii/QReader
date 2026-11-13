"""Store settings and order-page images. Add staff authentication to the write routes before production."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from database.init_db import get_db
from .schemas import StoreSettingsBody, StoreSettingsResponse
from .services import MAX_ASSET_BYTES, StoreService

router = APIRouter(prefix="/stores", tags=["Stores"])


@router.get("/{store_id}/settings", response_model=StoreSettingsResponse)
def get_settings(store_id: UUID, db: Session = Depends(get_db)):
    return StoreService(db).get_settings(store_id)


@router.put("/{store_id}/settings", response_model=StoreSettingsResponse)
def update_settings(store_id: UUID, body: StoreSettingsBody, db: Session = Depends(get_db)):
    return StoreService(db).update_settings(store_id, body)


@router.get("/{store_id}/assets/{kind}", response_class=Response)
def get_asset(store_id: UUID, kind: str, db: Session = Depends(get_db)):
    """Public: the customer's phone loads these. The URL carries a version, so cache hard."""
    asset = StoreService(db).get_asset(store_id, kind)
    return Response(
        content=asset.data,
        media_type=asset.content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.put("/{store_id}/assets/{kind}", response_model=StoreSettingsResponse)
async def put_asset(store_id: UUID, kind: str, request: Request, db: Session = Depends(get_db)):
    # Read at most one byte over the limit, so an oversized upload is refused early.
    data = b""
    async for chunk in request.stream():
        data += chunk
        if len(data) > MAX_ASSET_BYTES:
            break
    return StoreService(db).put_asset(store_id, kind, data)


@router.delete("/{store_id}/assets/{kind}", response_model=StoreSettingsResponse)
def delete_asset(store_id: UUID, kind: str, db: Session = Depends(get_db)):
    return StoreService(db).delete_asset(store_id, kind)
