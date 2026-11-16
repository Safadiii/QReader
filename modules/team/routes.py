from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.init_db import get_db
from .schemas import MemberCreate, MemberUpdate, MemberWithPassword, TeamMember
from .services import TeamService

# `actor_id` is the signed-in member, sent by the web app; the backend checks their role itself.
router = APIRouter(prefix="/stores/{store_id}/team", tags=["Team"])


@router.get("", response_model=list[TeamMember])
def list_team(store_id: UUID, actor_id: UUID, db: Session = Depends(get_db)):
    return TeamService(db).list(store_id, actor_id)


@router.post("", response_model=MemberWithPassword, status_code=201)
def add_member(store_id: UUID, actor_id: UUID, body: MemberCreate, db: Session = Depends(get_db)):
    return TeamService(db).add(store_id, actor_id, body)


@router.patch("/{user_id}", response_model=TeamMember)
def update_member(store_id: UUID, user_id: UUID, actor_id: UUID, body: MemberUpdate, db: Session = Depends(get_db)):
    return TeamService(db).update(store_id, actor_id, user_id, body)


@router.post("/{user_id}/reset-password", response_model=MemberWithPassword)
def reset_password(store_id: UUID, user_id: UUID, actor_id: UUID, db: Session = Depends(get_db)):
    return TeamService(db).reset_password(store_id, actor_id, user_id)
