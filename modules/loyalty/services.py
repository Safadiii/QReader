"""The stamp card. A phone keeps a secret; the first time it opens an order it gets a card at that
store. Each order it opens earns one stamp, which counts once staff mark the order collected. When
the stamps reach the goal, staff can hand out the reward, which uses those stamps up."""

import hashlib
import hmac
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database.schema import (
    LoyaltyCard,
    LoyaltyIdentity,
    LoyaltyProgram,
    LoyaltyRedemption,
    LoyaltyStamp,
    Order,
    OrderStatus,
    User,
)

from .schemas import (
    CardLookup,
    CardState,
    ProgramBody,
    ProgramResponse,
    RedemptionItem,
    StatsResponse,
    WaitingResponse,
)

# No 0/O, 1/I/L: the code is read out loud and typed at the till.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
DEFAULT_GOAL = 10
DEFAULT_REWARD = "Free coffee"
ACTIVE = (OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY)


def normalize_code(raw: str) -> str:
    return "".join(ch for ch in raw.upper() if ch.isalnum())


def normalize_phone(raw: str) -> str:
    """+<country code><number>, digits only. The web form always sends it in this shape."""
    digits = re.sub(r"\D", "", raw)
    if not raw.strip().startswith("+") or not 8 <= len(digits) <= 15:
        raise HTTPException(status_code=422, detail="Enter the phone number with its country code")
    return f"+{digits}"


def _looks_like_phone(raw: str) -> bool:
    cleaned = re.sub(r"[\s\-()]", "", raw)
    return bool(re.fullmatch(r"\+?\d{7,15}", cleaned))


def _hash_pin(pin: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(pin.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"{salt.hex()}${digest.hex()}"


def _check_pin(pin: str, stored: str) -> bool:
    salt_hex, _, digest_hex = stored.partition("$")
    digest = hashlib.scrypt(pin.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
    return hmac.compare_digest(digest.hex(), digest_hex)


MAX_PIN_TRIES = 5
LOCK_MINUTES = 15


def owner_hash(store_id: uuid.UUID, device: str) -> str:
    return hashlib.sha256(f"{store_id}:{device}".encode()).hexdigest()


def _new_code() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(8))


class LoyaltyService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------ the program

    def program(self, store_id: uuid.UUID) -> LoyaltyProgram | None:
        return self.db.get(LoyaltyProgram, store_id)

    def get_program(self, store_id: uuid.UUID) -> ProgramResponse:
        p = self.program(store_id)
        if p is None:
            return ProgramResponse(
                store_id=store_id, enabled=False, stamps_required=DEFAULT_GOAL, reward_name=DEFAULT_REWARD
            )
        return ProgramResponse(
            store_id=store_id, enabled=p.enabled, stamps_required=p.stamps_required, reward_name=p.reward_name
        )

    def save_program(self, store_id: uuid.UUID, body: ProgramBody) -> ProgramResponse:
        p = self.program(store_id)
        if p is None:
            p = LoyaltyProgram(store_id=store_id)
            self.db.add(p)
        p.enabled = body.enabled
        p.stamps_required = body.stamps_required
        p.reward_name = body.reward_name
        p.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        return self.get_program(store_id)

    # ------------------------------------------------------------------ cards

    def _counts(self, card_id: uuid.UUID) -> tuple[int, int, int, int]:
        """(stamps that count and are unused, pending stamps, rewards redeemed, stamps ever confirmed)."""
        confirmed = self.db.scalar(
            select(func.count()).select_from(LoyaltyStamp).where(
                LoyaltyStamp.card_id == card_id, LoyaltyStamp.confirmed_at.is_not(None)
            )
        ) or 0
        pending = self.db.scalar(
            select(func.count()).select_from(LoyaltyStamp).where(
                LoyaltyStamp.card_id == card_id, LoyaltyStamp.confirmed_at.is_(None)
            )
        ) or 0
        used, redeemed = self.db.execute(
            select(func.coalesce(func.sum(LoyaltyRedemption.stamps_used), 0), func.count()).where(
                LoyaltyRedemption.card_id == card_id
            )
        ).one()
        return confirmed - used, pending, redeemed, confirmed

    def _identity(self, card_id: uuid.UUID) -> LoyaltyIdentity | None:
        return self.db.scalar(select(LoyaltyIdentity).where(LoyaltyIdentity.card_id == card_id))

    def _state(self, card: LoyaltyCard, program: LoyaltyProgram, this_order: str = "none") -> CardState:
        stamps, pending, redeemed, _ = self._counts(card.id)
        ident = self._identity(card.id)
        return CardState(
            phone_saved=ident is not None,
            phone_hint=f"{ident.phone[:3]} ••• {ident.phone[-3:]}" if ident else "",
            enabled=True,
            goal=program.stamps_required,
            reward_name=program.reward_name,
            code=card.code,
            stamps=stamps,
            pending=pending,
            reward_ready=stamps >= program.stamps_required,
            rewards_redeemed=redeemed,
            this_order=this_order,
        )

    def _card_for(self, store_id: uuid.UUID, device: str) -> LoyaltyCard:
        owner = owner_hash(store_id, device)
        card = self.db.scalar(
            select(LoyaltyCard).where(LoyaltyCard.store_id == store_id, LoyaltyCard.owner_hash == owner)
        )
        if card is not None:
            return card
        for _ in range(8):
            card = LoyaltyCard(store_id=store_id, owner_hash=owner, code=_new_code())
            try:
                with self.db.begin_nested():
                    self.db.add(card)
                    self.db.flush()
                return card
            except IntegrityError:
                # Either another request made this phone's card a moment ago, or the code clashed.
                existing = self.db.scalar(
                    select(LoyaltyCard).where(LoyaltyCard.store_id == store_id, LoyaltyCard.owner_hash == owner)
                )
                if existing is not None:
                    return existing
        raise HTTPException(status_code=503, detail="Could not make a card, try again")

    def claim(self, order: Order, device: str) -> CardState:
        """The customer's phone opened this order: give them the card and the stamp it earns."""
        program = self.program(order.store_id)
        if program is None or not program.enabled:
            return CardState(enabled=False)
        try:
            card = self._card_for(order.store_id, device)
            stamp = self.db.scalar(select(LoyaltyStamp).where(LoyaltyStamp.order_id == order.id))
            if stamp is None and order.status != OrderStatus.CANCELLED:
                collected = order.status == OrderStatus.COLLECTED
                try:
                    with self.db.begin_nested():
                        stamp = LoyaltyStamp(
                            card_id=card.id,
                            order_id=order.id,
                            confirmed_at=datetime.now(timezone.utc) if collected else None,
                        )
                        self.db.add(stamp)
                        self.db.flush()
                except IntegrityError:
                    stamp = self.db.scalar(select(LoyaltyStamp).where(LoyaltyStamp.order_id == order.id))
            this_order = "none"
            if stamp is not None and stamp.card_id == card.id:
                this_order = "stamped" if stamp.confirmed_at else "pending"
            self.db.commit()
            return self._state(card, program, this_order)
        except Exception:
            self.db.rollback()
            raise

    def _merge(self, source: LoyaltyCard, into: LoyaltyCard) -> None:
        """Move everything on `source` onto `into`, then remove the empty card."""
        self.db.execute(update(LoyaltyStamp).where(LoyaltyStamp.card_id == source.id).values(card_id=into.id))
        self.db.execute(update(LoyaltyRedemption).where(LoyaltyRedemption.card_id == source.id).values(card_id=into.id))
        self.db.delete(source)
        self.db.flush()

    def save_phone(self, order: Order, device: str, raw_phone: str, pin: str) -> CardState:
        """First time for this number: save this phone's card to it. A number already saved:
        the PIN proves it is theirs, and this phone's card joins the saved one."""
        program = self.program(order.store_id)
        if program is None or not program.enabled:
            return CardState(enabled=False)
        phone = normalize_phone(raw_phone)
        try:
            mine = self._card_for(order.store_id, device)
            ident = self.db.scalar(
                select(LoyaltyIdentity)
                .where(LoyaltyIdentity.store_id == order.store_id, LoyaltyIdentity.phone == phone)
                .with_for_update()
            )
            my_ident = self._identity(mine.id)
            card = mine
            now = datetime.now(timezone.utc)

            if ident is None:
                if my_ident is not None:
                    raise HTTPException(status_code=409, detail="card_has_phone")
                try:
                    with self.db.begin_nested():
                        self.db.add(
                            LoyaltyIdentity(store_id=order.store_id, card_id=mine.id, phone=phone, pin_hash=_hash_pin(pin))
                        )
                        self.db.flush()
                except IntegrityError:
                    raise HTTPException(status_code=409, detail="try_again")
            else:
                if ident.locked_until is not None and ident.locked_until > now:
                    raise HTTPException(status_code=403, detail="locked")
                if not _check_pin(pin, ident.pin_hash):
                    ident.failed_attempts += 1
                    if ident.failed_attempts >= MAX_PIN_TRIES:
                        ident.locked_until = now + timedelta(minutes=LOCK_MINUTES)
                        ident.failed_attempts = 0
                    self.db.commit()  # the failed try must be remembered
                    raise HTTPException(status_code=403, detail="wrong_pin")
                ident.failed_attempts = 0
                ident.locked_until = None
                card = self.db.scalar(select(LoyaltyCard).where(LoyaltyCard.id == ident.card_id).with_for_update())
                if card.id != mine.id:
                    if my_ident is not None:
                        raise HTTPException(status_code=409, detail="card_has_phone")
                    self._merge(mine, card)
                card.owner_hash = owner_hash(order.store_id, device)

            stamp = self.db.scalar(select(LoyaltyStamp).where(LoyaltyStamp.order_id == order.id))
            this_order = "none"
            if stamp is not None and stamp.card_id == card.id:
                this_order = "stamped" if stamp.confirmed_at else "pending"
            self.db.commit()
            return self._state(card, program, this_order)
        except HTTPException as exc:
            if exc.detail != "wrong_pin":  # that one already committed its counter
                self.db.rollback()
            raise
        except Exception:
            self.db.rollback()
            raise

    def restore(self, order: Order, device: str, raw_code: str) -> CardState:
        """Give the card with this code to this phone. If the phone already started a new card,
        its stamps and rewards move onto the restored one, so nothing is lost either way."""
        program = self.program(order.store_id)
        if program is None or not program.enabled:
            return CardState(enabled=False)
        try:
            code = normalize_code(raw_code)
            wanted = self.db.scalar(
                select(LoyaltyCard).where(LoyaltyCard.store_id == order.store_id, LoyaltyCard.code == code).with_for_update()
            )
            if wanted is None:
                raise HTTPException(status_code=404, detail="No card with that code")
            mine = owner_hash(order.store_id, device)
            current = self.db.scalar(
                select(LoyaltyCard).where(LoyaltyCard.store_id == order.store_id, LoyaltyCard.owner_hash == mine)
            )
            if current is not None and current.id != wanted.id:
                self.db.execute(update(LoyaltyStamp).where(LoyaltyStamp.card_id == current.id).values(card_id=wanted.id))
                self.db.execute(
                    update(LoyaltyRedemption).where(LoyaltyRedemption.card_id == current.id).values(card_id=wanted.id)
                )
                self.db.delete(current)
                self.db.flush()
            wanted.owner_hash = mine
            stamp = self.db.scalar(select(LoyaltyStamp).where(LoyaltyStamp.order_id == order.id))
            this_order = "none"
            if stamp is not None and stamp.card_id == wanted.id:
                this_order = "stamped" if stamp.confirmed_at else "pending"
            self.db.commit()
            return self._state(wanted, program, this_order)
        except Exception:
            self.db.rollback()
            raise

    def confirm_order(self, order_id: uuid.UUID) -> None:
        """Called inside the transaction that marks an order collected: its stamp now counts."""
        self.db.execute(
            update(LoyaltyStamp)
            .where(LoyaltyStamp.order_id == order_id, LoyaltyStamp.confirmed_at.is_(None))
            .values(confirmed_at=datetime.now(timezone.utc))
        )

    # ------------------------------------------------------------ at the till

    def lookup(self, store_id: uuid.UUID, raw_code: str) -> CardLookup:
        program = self.program(store_id)
        if program is None or not program.enabled:
            raise HTTPException(status_code=409, detail="The loyalty card is turned off")
        if _looks_like_phone(raw_code):
            card = self._card_by_phone(store_id, raw_code)
        else:
            code = normalize_code(raw_code)
            card = self.db.scalar(
                select(LoyaltyCard).where(LoyaltyCard.store_id == store_id, LoyaltyCard.code == code)
            )
        if card is None:
            raise HTTPException(status_code=404, detail="No card with that code or number")
        return CardLookup(**self._state(card, program).model_dump(), card_id=card.id)

    def _card_by_phone(self, store_id: uuid.UUID, raw: str) -> LoyaltyCard | None:
        """Full +number matches exactly; a local number (0555 123 4567) matches by its last digits."""
        digits = re.sub(r"\D", "", raw)
        idents = self.db.scalars(select(LoyaltyIdentity).where(LoyaltyIdentity.store_id == store_id)).all()
        if raw.strip().startswith("+"):
            hits = [i for i in idents if i.phone == f"+{digits}"]
        else:
            tail = digits.lstrip("0")
            hits = [i for i in idents if len(tail) >= 7 and i.phone.endswith(tail)]
        if len(hits) > 1:
            raise HTTPException(status_code=409, detail="More than one match: type the full number with its +country code")
        return self.db.get(LoyaltyCard, hits[0].card_id) if hits else None

    def _redeem(self, card_id: uuid.UUID, actor: User, order_id: uuid.UUID | None) -> CardState:
        try:
            # Locked, so two cashiers can never hand out the same reward twice.
            card = self.db.scalar(select(LoyaltyCard).where(LoyaltyCard.id == card_id).with_for_update())
            program = self.program(card.store_id) if card else None
            if card is None or program is None or not program.enabled:
                raise HTTPException(status_code=409, detail="The loyalty card is turned off")
            stamps, _, _, _ = self._counts(card.id)
            if stamps < program.stamps_required:
                raise HTTPException(status_code=409, detail="Not enough stamps yet")
            self.db.add(
                LoyaltyRedemption(
                    card_id=card.id,
                    redeemed_by=actor.id,
                    order_id=order_id,
                    stamps_used=program.stamps_required,
                    reward_name=program.reward_name,
                )
            )
            self.db.commit()
            return self._state(card, program)
        except Exception:
            self.db.rollback()
            raise

    def redeem_by_code(self, store_id: uuid.UUID, raw_code: str, actor: User) -> CardState:
        found = self.lookup(store_id, raw_code)
        return self._redeem(found.card_id, actor, None)

    def redeem_for_order(self, store_id: uuid.UUID, order_id: uuid.UUID, actor: User) -> CardState:
        row = self.db.execute(
            select(LoyaltyStamp.card_id, Order.store_id)
            .join(Order, Order.id == LoyaltyStamp.order_id)
            .where(LoyaltyStamp.order_id == order_id)
        ).first()
        if row is None or row.store_id != store_id:
            raise HTTPException(status_code=404, detail="That order has no loyalty card")
        return self._redeem(row.card_id, actor, order_id)

    def waiting(self, store_id: uuid.UUID) -> WaitingResponse:
        """Active orders whose customer has a free reward ready, so the kitchen can see it."""
        program = self.program(store_id)
        if program is None or not program.enabled:
            return WaitingResponse(order_ids=[])
        rows = self.db.execute(
            select(Order.id, LoyaltyStamp.card_id)
            .join(LoyaltyStamp, LoyaltyStamp.order_id == Order.id)
            .where(Order.store_id == store_id, Order.status.in_(ACTIVE))
        ).all()
        if not rows:
            return WaitingResponse(order_ids=[])
        balances = self._balances({card_id for _, card_id in rows})
        return WaitingResponse(
            order_ids=[oid for oid, card_id in rows if balances.get(card_id, 0) >= program.stamps_required]
        )

    def _balances(self, card_ids: set[uuid.UUID]) -> dict[uuid.UUID, int]:
        confirmed = dict(
            self.db.execute(
                select(LoyaltyStamp.card_id, func.count())
                .where(LoyaltyStamp.card_id.in_(card_ids), LoyaltyStamp.confirmed_at.is_not(None))
                .group_by(LoyaltyStamp.card_id)
            ).all()
        )
        used = dict(
            self.db.execute(
                select(LoyaltyRedemption.card_id, func.sum(LoyaltyRedemption.stamps_used))
                .where(LoyaltyRedemption.card_id.in_(card_ids))
                .group_by(LoyaltyRedemption.card_id)
            ).all()
        )
        return {c: confirmed.get(c, 0) - int(used.get(c, 0)) for c in card_ids}

    # ------------------------------------------------------------------ stats

    def stats(self, store_id: uuid.UUID) -> StatsResponse:
        program = self.get_program(store_id)
        card_ids = set(self.db.scalars(select(LoyaltyCard.id).where(LoyaltyCard.store_id == store_id)).all())
        since = datetime.now(timezone.utc) - timedelta(days=30)

        stamps_given = stamps_pending = redeemed = waiting = new_cards = with_phone = 0
        recent: list[RedemptionItem] = []
        if card_ids:
            stamps_given = self.db.scalar(
                select(func.count()).select_from(LoyaltyStamp).where(
                    LoyaltyStamp.card_id.in_(card_ids), LoyaltyStamp.confirmed_at.is_not(None)
                )
            ) or 0
            stamps_pending = self.db.scalar(
                select(func.count()).select_from(LoyaltyStamp).where(
                    LoyaltyStamp.card_id.in_(card_ids), LoyaltyStamp.confirmed_at.is_(None)
                )
            ) or 0
            redeemed = self.db.scalar(
                select(func.count()).select_from(LoyaltyRedemption).where(LoyaltyRedemption.card_id.in_(card_ids))
            ) or 0
            waiting = sum(1 for b in self._balances(card_ids).values() if b >= program.stamps_required)
            with_phone = self.db.scalar(
                select(func.count()).select_from(LoyaltyIdentity).where(LoyaltyIdentity.store_id == store_id)
            ) or 0
            new_cards = self.db.scalar(
                select(func.count()).select_from(LoyaltyCard).where(
                    LoyaltyCard.store_id == store_id, LoyaltyCard.created_at >= since
                )
            ) or 0
            rows = self.db.execute(
                select(LoyaltyCard.code, LoyaltyRedemption.reward_name, LoyaltyRedemption.created_at, User.name)
                .join(LoyaltyCard, LoyaltyCard.id == LoyaltyRedemption.card_id)
                .join(User, User.id == LoyaltyRedemption.redeemed_by, isouter=True)
                .where(LoyaltyRedemption.card_id.in_(card_ids))
                .order_by(LoyaltyRedemption.created_at.desc())
                .limit(8)
            ).all()
            recent = [
                RedemptionItem(code=code, reward_name=reward, created_at=when, by=name)
                for code, reward, when, name in rows
            ]
        return StatsResponse(
            enabled=program.enabled,
            cards=len(card_ids),
            stamps_given=stamps_given,
            stamps_pending=stamps_pending,
            rewards_redeemed=redeemed,
            rewards_waiting=waiting,
            cards_with_phone=with_phone,
            new_cards_30d=new_cards,
            recent=recent,
        )
