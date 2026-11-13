from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.schema import Store, StoreAsset, StoreSettings
from .schemas import StoreSettingsBody, StoreSettingsResponse

MAX_ASSET_BYTES = 2 * 1024 * 1024
ASSET_KINDS = {"logo", "background", "banner"}
SETTING_FIELDS = [name for name in StoreSettingsBody.model_fields if name != "name"]


def sniff_image(data: bytes) -> str | None:
    """Trust the bytes, not the header the client sent. SVG is refused on purpose."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


class StoreService:
    def __init__(self, db: Session):
        self.db = db

    def _store(self, store_id: UUID) -> Store:
        store = self.db.get(Store, store_id)
        if store is None:
            raise HTTPException(status_code=404, detail="Store not found")
        return store

    def _settings(self, store_id: UUID) -> StoreSettings:
        """The store's settings row, created with defaults the first time."""
        settings = self.db.get(StoreSettings, store_id)
        if settings is None:
            settings = StoreSettings(store_id=store_id, links={})
            self.db.add(settings)
            self.db.commit()
            self.db.refresh(settings)
        return settings

    def get_settings(self, store_id: UUID) -> StoreSettingsResponse:
        store = self._store(store_id)
        settings = self._settings(store_id)
        assets = self.db.execute(
            select(StoreAsset.kind, StoreAsset.updated_at).where(StoreAsset.store_id == store_id)
        ).all()
        return StoreSettingsResponse(
            store_id=store_id,
            name=store.name,
            assets={kind: str(int(updated.timestamp() * 1000)) for kind, updated in assets},
            **{field: getattr(settings, field) for field in SETTING_FIELDS},
        )

    def update_settings(self, store_id: UUID, body: StoreSettingsBody) -> StoreSettingsResponse:
        store = self._store(store_id)
        settings = self._settings(store_id)
        store.name = body.name
        for field in SETTING_FIELDS:
            setattr(settings, field, getattr(body, field))
        settings.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        return self.get_settings(store_id)

    def _asset(self, store_id: UUID, kind: str) -> StoreAsset | None:
        if kind not in ASSET_KINDS:
            raise HTTPException(status_code=404, detail="Unknown image")
        return self.db.scalar(
            select(StoreAsset).where(StoreAsset.store_id == store_id, StoreAsset.kind == kind)
        )

    def get_asset(self, store_id: UUID, kind: str) -> StoreAsset:
        asset = self._asset(store_id, kind)
        if asset is None:
            raise HTTPException(status_code=404, detail="Image not found")
        return asset

    def put_asset(self, store_id: UUID, kind: str, data: bytes) -> StoreSettingsResponse:
        self._store(store_id)
        if len(data) > MAX_ASSET_BYTES:
            raise HTTPException(status_code=413, detail="Image is larger than 2 MB")
        content_type = sniff_image(data)
        if content_type is None:
            raise HTTPException(status_code=415, detail="Use a PNG, JPEG or WebP image")
        asset = self._asset(store_id, kind)
        if asset is None:
            asset = StoreAsset(store_id=store_id, kind=kind)
            self.db.add(asset)
        asset.content_type = content_type
        asset.data = data
        asset.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        return self.get_settings(store_id)

    def delete_asset(self, store_id: UUID, kind: str) -> StoreSettingsResponse:
        asset = self._asset(store_id, kind)
        if asset is not None:
            self.db.delete(asset)
            self.db.commit()
        return self.get_settings(store_id)
