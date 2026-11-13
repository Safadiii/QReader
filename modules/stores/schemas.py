from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, field_validator

Language = Literal["tr", "en"]
AlertSound = Literal["pager", "marimba", "crystal", "classic"]
Theme = Literal["graphite", "amber", "espresso", "ocean", "forest", "plum", "wine", "paper"]
LinkKind = Literal["menu", "instagram", "tiktok", "snapchat", "x", "website", "map"]
AssetKind = Literal["logo", "background", "banner"]

HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]


def clean_url(value: str | None) -> str | None:
    """Empty means "not set". Only web links: never javascript: or data: URLs."""
    if value is None or not value.strip():
        return None
    value = value.strip()
    if len(value) > 500 or not value.lower().startswith(("https://", "http://")):
        raise ValueError("Links must start with https:// and be at most 500 characters")
    return value


def clean_text(value: str | None) -> str | None:
    return value.strip() or None if value else None


class StoreSettingsBody(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    default_language: Language = "tr"

    alert_sound: AlertSound = "pager"
    # May contain {number} and {venue}. Empty uses the built-in text.
    alert_title_tr: str | None = Field(default=None, max_length=120)
    alert_text_tr: str | None = Field(default=None, max_length=200)
    alert_title_en: str | None = Field(default=None, max_length=120)
    alert_text_en: str | None = Field(default=None, max_length=200)

    ask_rating: bool = True
    google_min_stars: int = Field(default=4, ge=3, le=5)
    google_review_url: str | None = None

    theme: Theme = "graphite"
    brand_color: HexColor | None = None
    card_color: HexColor | None = None
    number_color: HexColor | None = None
    links: dict[LinkKind, str] = {}
    banner_url: str | None = None

    @field_validator("google_review_url", "banner_url")
    @classmethod
    def _urls(cls, value: str | None) -> str | None:
        return clean_url(value)

    @field_validator("alert_title_tr", "alert_text_tr", "alert_title_en", "alert_text_en")
    @classmethod
    def _texts(cls, value: str | None) -> str | None:
        return clean_text(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return value.strip()

    @field_validator("links")
    @classmethod
    def _links(cls, value: dict[str, str]) -> dict[str, str]:
        cleaned = {kind: clean_url(url) for kind, url in value.items()}
        return {kind: url for kind, url in cleaned.items() if url}


class StoreSettingsResponse(StoreSettingsBody):
    store_id: UUID
    # Uploaded images: kind -> version (changes on every upload, for cache busting).
    assets: dict[AssetKind, str] = {}
