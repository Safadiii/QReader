"""
Create a team member (and, the first time, the store itself with its owner).
Staff sign in with their phone number: type it with the country code, e.g. +961 3 123 456.

    python -m database.create_user

It asks for everything, including the password (typed hidden). Run it against
production by setting DATABASE_URL to the production database first.
"""

import getpass
import sys
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select

from database.init_db import SessionLocal
from database.schema import Store, User, UserRole
from modules.auth.passwords import hash_password
from modules.auth.phone import normalize_phone


def ask(prompt: str) -> str:
    value = input(prompt).strip()
    if not value:
        sys.exit("Nothing entered. Stopped.")
    return value


def ask_timezone() -> str:
    """Asks until it gets a real timezone name; orders are dated in this timezone."""
    while True:
        name = input("Timezone, e.g. Europe/Istanbul or Asia/Riyadh [Asia/Beirut]: ").strip() or "Asia/Beirut"
        try:
            ZoneInfo(name)
            return name
        except (ZoneInfoNotFoundError, ValueError):
            print(f"  '{name}' is not a timezone name. Use the Region/City form, with capitals.")


def main() -> None:
    with SessionLocal() as db:
        stores = db.scalars(select(Store).order_by(Store.created_at)).all()
        store = None
        if stores:
            print("Stores:")
            for i, s in enumerate(stores, 1):
                print(f"  {i}. {s.name}")
            choice = input("Pick a number, or press Enter to create a new store: ").strip()
            if choice:
                store = stores[int(choice) - 1]
        if store is None:
            store = Store(name=ask("New store name: "))
            store.timezone = ask_timezone()
            db.add(store)
            db.flush()

        name = ask("Member's name: ")
        while True:
            try:
                phone = normalize_phone(ask("Phone number with country code, e.g. +961 3 123 456: "))
                break
            except ValueError as error:
                print(f"  {error}")
        if db.scalar(select(User).where(User.phone == phone)):
            sys.exit("That phone number already has a login.")
        has_owner = db.scalar(select(User).where(User.store_id == store.id, User.role == UserRole.OWNER))
        if has_owner is None:
            role = UserRole.OWNER
            print("This store has no owner yet, so this member will be the owner.")
        else:
            pick = input("Role: [m]anager or [s]taff? [s] ").strip().lower()
            role = UserRole.MANAGER if pick == "m" else UserRole.STAFF

        password = getpass.getpass("Password (at least 10 characters): ")
        if len(password) < 10:
            sys.exit("Password too short. Stopped.")
        if getpass.getpass("Password again: ") != password:
            sys.exit("Passwords do not match. Stopped.")

        db.add(User(store_id=store.id, name=name, phone=phone, password_hash=hash_password(password), role=role))
        db.commit()
        print(f"Created {role.value} login for {phone} at {store.name}.")


if __name__ == "__main__":
    main()
