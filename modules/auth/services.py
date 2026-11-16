import time
from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from database.schema import Store, User, UserRole
from .passwords import DUMMY_HASH, hash_password, verify_password
from .phone import normalize_phone
from .schemas import SignupBody, StaffResponse

MAX_FAILURES = 5
LOCK_SECONDS = 15 * 60

# Failed sign-ins per phone number. In memory: enough for one server process; move to
# the database or Redis if the backend ever runs as several instances.
_failures: dict[str, list[float]] = defaultdict(list)


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _response(user: User) -> StaffResponse:
        return StaffResponse(
            id=user.id,
            store_id=user.store_id,
            store_name=user.store.name,
            name=user.name,
            phone=user.phone,
            role=user.role,
        )

    def current(self, user_id) -> StaffResponse:
        """Used by the web app to confirm a signed-in member is still allowed in."""
        user = self.db.get(User, user_id)
        if user is None or not user.is_active:
            raise HTTPException(status_code=404, detail="Not found")
        return self._response(user)

    def login(self, phone: str, password: str) -> StaffResponse:
        try:
            key = normalize_phone(phone)  # the lockout key; unusable numbers just fail below
        except ValueError:
            key = phone.strip()
        now = time.monotonic()
        recent = [t for t in _failures[key] if now - t < LOCK_SECONDS]
        _failures[key] = recent
        if len(recent) >= MAX_FAILURES:
            raise HTTPException(status_code=429, detail="Too many attempts. Try again in 15 minutes.")

        user = self.db.scalar(select(User).where(User.phone == key))
        valid = verify_password(password, user.password_hash if user else DUMMY_HASH)
        if user is None or not valid or not user.is_active:
            _failures[key].append(now)
            # One message for every failure, so nobody can probe which numbers exist.
            raise HTTPException(status_code=401, detail="Wrong phone number or password")

        _failures.pop(key, None)
        return self._response(user)

    def signup(self, body: SignupBody) -> StaffResponse:
        """Creates a store and its owner. The phone number is not verified yet (a WhatsApp code comes later)."""
        if self.db.scalar(select(User).where(User.phone == body.phone)):
            raise HTTPException(status_code=409, detail="That phone number already has an account")
        zone = "Asia/Beirut"
        if body.timezone:
            try:
                ZoneInfo(body.timezone)
                zone = body.timezone
            except (ZoneInfoNotFoundError, ValueError):
                pass
        store = Store(name=body.store_name, timezone=zone)
        self.db.add(store)
        self.db.flush()
        user = User(
            store_id=store.id, name=body.name, phone=body.phone,
            password_hash=hash_password(body.password), role=UserRole.OWNER,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return self._response(user)
