import time
from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database.schema import User
from .passwords import DUMMY_HASH, verify_password
from .schemas import StaffResponse

MAX_FAILURES = 5
LOCK_SECONDS = 15 * 60

# Failed sign-ins per email. In memory: enough for one server process; move to
# the database or Redis if the backend ever runs as several instances.
_failures: dict[str, list[float]] = defaultdict(list)


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def login(self, email: str, password: str) -> StaffResponse:
        email = email.strip().lower()
        now = time.monotonic()
        recent = [t for t in _failures[email] if now - t < LOCK_SECONDS]
        _failures[email] = recent
        if len(recent) >= MAX_FAILURES:
            raise HTTPException(status_code=429, detail="Too many attempts. Try again in 15 minutes.")

        user = self.db.scalar(select(User).where(func.lower(User.email) == email))
        valid = verify_password(password, user.password_hash if user else DUMMY_HASH)
        if user is None or not valid or not user.is_active:
            _failures[email].append(now)
            # One message for every failure, so nobody can probe which emails exist.
            raise HTTPException(status_code=401, detail="Wrong email or password")

        _failures.pop(email, None)
        return StaffResponse(
            id=user.id,
            store_id=user.store_id,
            store_name=user.store.name,
            name=user.name,
            email=user.email,
            role=user.role,
        )
