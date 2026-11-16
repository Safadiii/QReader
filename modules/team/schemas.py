from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from database.schema import UserRole
from modules.auth.phone import normalize_phone


class TeamMember(BaseModel):
    id: UUID
    name: str
    phone: str
    role: UserRole
    is_owner: bool
    is_active: bool
    created_at: datetime


class MemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    phone: str
    role: UserRole = UserRole.STAFF
    # Left empty, a one-time password is generated and shown to whoever adds the member.
    password: str | None = Field(default=None, min_length=8, max_length=200)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return normalize_phone(value)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return value.strip()


class MemberUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    role: UserRole | None = None
    is_active: bool | None = None


class MemberWithPassword(BaseModel):
    member: TeamMember
    # Shown once; only the hash is stored.
    temporary_password: str
