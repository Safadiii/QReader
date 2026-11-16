"""Who may do what. The backend is the authority; the web app only hides buttons."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from database.schema import User, UserRole

RANK = {UserRole.STAFF: 1, UserRole.MANAGER: 2, UserRole.OWNER: 3}


def require_actor(db: Session, store_id: UUID, actor_id: UUID, at_least: UserRole) -> User:
    """The signed-in member making this request, if active, in this store, and senior enough."""
    actor = db.get(User, actor_id)
    if actor is None or not actor.is_active or actor.store_id != store_id:
        raise HTTPException(status_code=403, detail="Not allowed")
    if RANK[actor.role] < RANK[at_least]:
        raise HTTPException(status_code=403, detail="Your role cannot do this")
    return actor
