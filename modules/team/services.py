import secrets

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.schema import User, UserRole
from modules.auth.passwords import hash_password
from modules.auth.permissions import RANK, require_actor

from .schemas import MemberCreate, MemberUpdate, MemberWithPassword, TeamMember

# No 0/O/1/l/I, so a password read aloud or from a screen is not misread.
_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_password() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(10))


def _member(user: User) -> TeamMember:
    return TeamMember(
        id=user.id, name=user.name, phone=user.phone, role=user.role,
        is_owner=user.role == UserRole.OWNER, is_active=user.is_active, created_at=user.created_at,
    )


class TeamService:
    def __init__(self, db: Session):
        self.db = db

    def _target(self, store_id, user_id) -> User:
        user = self.db.get(User, user_id)
        if user is None or user.store_id != store_id:
            raise HTTPException(status_code=404, detail="Member not found")
        return user

    @staticmethod
    def _can_manage(actor: User, target: User) -> None:
        """Owners manage managers and staff; managers manage staff; nobody manages the owner."""
        if target.role == UserRole.OWNER or RANK[target.role] >= RANK[actor.role]:
            raise HTTPException(status_code=403, detail="Your role cannot change this member")

    def list(self, store_id, actor_id) -> list[TeamMember]:
        require_actor(self.db, store_id, actor_id, UserRole.MANAGER)
        users = self.db.scalars(select(User).where(User.store_id == store_id)).all()
        # The owner first, then managers, then staff; active before removed.
        users = sorted(users, key=lambda u: (not u.is_active, -RANK[u.role], u.name.lower()))
        return [_member(u) for u in users]

    def add(self, store_id, actor_id, body: MemberCreate) -> MemberWithPassword:
        actor = require_actor(self.db, store_id, actor_id, UserRole.MANAGER)
        if body.role == UserRole.OWNER or RANK[body.role] >= RANK[actor.role]:
            raise HTTPException(status_code=403, detail="Your role cannot add this kind of member")
        if self.db.scalar(select(User).where(User.phone == body.phone)):
            raise HTTPException(status_code=409, detail="That phone number already has a login")
        password = body.password or new_password()
        user = User(
            store_id=store_id, name=body.name, phone=body.phone, role=body.role,
            password_hash=hash_password(password),
        )
        self.db.add(user)
        self.db.commit()
        return MemberWithPassword(member=_member(user), temporary_password=password)

    def update(self, store_id, actor_id, user_id, body: MemberUpdate) -> TeamMember:
        actor = require_actor(self.db, store_id, actor_id, UserRole.MANAGER)
        user = self._target(store_id, user_id)
        self._can_manage(actor, user)
        if body.role is not None and body.role != user.role:
            if actor.role != UserRole.OWNER:
                raise HTTPException(status_code=403, detail="Only the owner can change roles")
            if body.role == UserRole.OWNER:
                raise HTTPException(status_code=403, detail="A store has one owner")
            user.role = body.role
        if body.name is not None:
            user.name = body.name.strip()
        if body.is_active is not None:
            user.is_active = body.is_active
        self.db.commit()
        return _member(user)

    def reset_password(self, store_id, actor_id, user_id) -> MemberWithPassword:
        actor = require_actor(self.db, store_id, actor_id, UserRole.MANAGER)
        user = self._target(store_id, user_id)
        self._can_manage(actor, user)
        password = new_password()
        user.password_hash = hash_password(password)
        self.db.commit()
        return MemberWithPassword(member=_member(user), temporary_password=password)
