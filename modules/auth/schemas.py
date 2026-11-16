from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from database.schema import UserRole
from .phone import normalize_phone


class LoginBody(BaseModel):
    phone: str = Field(min_length=5, max_length=40)
    password: str = Field(min_length=1, max_length=200)


class SignupBody(BaseModel):
    """A new business: its first store and the owner who runs it."""
    store_name: str = Field(min_length=1, max_length=150)
    name: str = Field(min_length=1, max_length=150)
    phone: str
    password: str = Field(min_length=10, max_length=200)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return normalize_phone(value)

    @field_validator("store_name", "name")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Required")
        return value


class StaffResponse(BaseModel):
    id: UUID
    store_id: UUID
    store_name: str
    name: str
    phone: str
    role: UserRole
