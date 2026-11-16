from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.init_db import get_db
from .schemas import LoginBody, SignupBody, StaffResponse
from .services import AuthService

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=StaffResponse)
def login(body: LoginBody, db: Session = Depends(get_db)):
    """Checks a staff member's password. The web app keeps the session, not this API."""
    return AuthService(db).login(body.phone, body.password)


@router.post("/signup", response_model=StaffResponse, status_code=201)
def signup(body: SignupBody, db: Session = Depends(get_db)):
    """A new business signs up: creates its store and makes this person the owner."""
    return AuthService(db).signup(body)


@router.get("/members/{user_id}", response_model=StaffResponse)
def current_member(user_id: UUID, db: Session = Depends(get_db)):
    """404 when the member was removed, so their old session stops working."""
    return AuthService(db).current(user_id)
