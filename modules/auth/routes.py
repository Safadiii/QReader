from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.init_db import get_db
from .schemas import LoginBody, StaffResponse
from .services import AuthService

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=StaffResponse)
def login(body: LoginBody, db: Session = Depends(get_db)):
    """Checks a staff member's password. The web app keeps the session, not this API."""
    return AuthService(db).login(body.email, body.password)
