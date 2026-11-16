from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ProgramBody(BaseModel):
    enabled: bool
    stamps_required: int = Field(ge=3, le=30)
    reward_name: str = Field(min_length=1, max_length=80)

    @field_validator("reward_name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Give the reward a name")
        return value


class ProgramResponse(ProgramBody):
    store_id: UUID


class DeviceBody(BaseModel):
    """The secret a phone keeps to prove a card is its own."""
    device: str = Field(min_length=16, max_length=128)


class PhoneBody(DeviceBody):
    """Save this phone's card to a phone number, or sign in to the card already saved to it."""
    phone: str = Field(min_length=6, max_length=24)
    pin: str = Field(pattern=r"^[0-9]{4}$")


class RestoreBody(DeviceBody):
    """A phone that lost its card (new phone, cleared browser) claims it back with the card's code."""
    code: str = Field(min_length=4, max_length=12)


class CardState(BaseModel):
    enabled: bool
    # Where the customer's card stands. All zero when the program is off.
    goal: int = 0
    reward_name: str = ""
    code: str = ""
    # Stamps that count (orders collected) and not yet used up by a reward.
    stamps: int = 0
    # Stamps from orders claimed but not collected yet.
    pending: int = 0
    # True when `stamps` is enough for a free reward.
    reward_ready: bool = False
    rewards_redeemed: int = 0
    # What this order is doing for the card: "pending", "stamped", or "none".
    this_order: str = "none"
    # Saved to a phone number? Only the end of it is shown back, e.g. "+90 ••• 099".
    phone_saved: bool = False
    phone_hint: str = ""


class CardLookup(CardState):
    card_id: UUID | None = None


class RedemptionItem(BaseModel):
    code: str
    reward_name: str
    created_at: datetime
    by: str | None


class StatsResponse(BaseModel):
    enabled: bool
    cards: int
    stamps_given: int
    stamps_pending: int
    rewards_redeemed: int
    rewards_waiting: int
    cards_with_phone: int
    new_cards_30d: int
    recent: list[RedemptionItem]


class WaitingResponse(BaseModel):
    # Active orders whose customer has a free reward ready.
    order_ids: list[UUID]
