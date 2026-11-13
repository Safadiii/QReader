from uuid import UUID

from pydantic import BaseModel, Field

from database.schema import UserRole


class LoginBody(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)


class StaffResponse(BaseModel):
    id: UUID
    store_id: UUID
    store_name: str
    name: str
    email: str
    role: UserRole
