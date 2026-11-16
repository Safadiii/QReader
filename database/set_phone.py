"""
Change a member's phone number (used once after the phone-login upgrade, when
existing members only have a placeholder number).

    python -m database.set_phone
"""

import sys

from sqlalchemy import select

from database.init_db import SessionLocal
from database.schema import Store, User
from modules.auth.phone import normalize_phone


def main() -> None:
    with SessionLocal() as db:
        rows = db.execute(select(User, Store).join(Store, Store.id == User.store_id).order_by(Store.name, User.name)).all()
        for i, (user, store) in enumerate(rows, 1):
            print(f"  {i}. {user.name} ({user.role.value}) at {store.name}: {user.phone}")
        user = rows[int(input("Pick a number: ").strip()) - 1][0]
        try:
            phone = normalize_phone(input("New phone number with country code, e.g. +961 3 123 456: "))
        except ValueError as error:
            sys.exit(str(error))
        if db.scalar(select(User).where(User.phone == phone, User.id != user.id)):
            sys.exit("That phone number belongs to someone else.")
        user.phone = phone
        db.commit()
        print(f"{user.name} now signs in with {phone}.")


if __name__ == "__main__":
    main()
