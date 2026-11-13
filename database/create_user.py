"""
Create a staff login (and, the first time, the store itself).

    python -m database.create_user

It asks for everything, including the password (typed hidden). Run it against
production by setting DATABASE_URL to the production database first.
"""

import getpass
import sys
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select

from database.init_db import SessionLocal
from database.schema import Store, User, UserRole
from modules.auth.passwords import hash_password


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

        name = ask("Staff member's name: ")
        email = ask("Email: ").lower()
        if db.scalar(select(User).where(func.lower(User.email) == email)):
            sys.exit("That email already has a login.")
        role = UserRole.CASHIER if input("Role: [a]dmin or [c]ashier? [a] ").strip().lower() == "c" else UserRole.ADMIN

        password = getpass.getpass("Password (at least 10 characters): ")
        if len(password) < 10:
            sys.exit("Password too short. Stopped.")
        if getpass.getpass("Password again: ") != password:
            sys.exit("Passwords do not match. Stopped.")

        db.add(User(store_id=store.id, name=name, email=email, password_hash=hash_password(password), role=role))
        db.commit()
        print(f"Created {role.value} login for {email} at {store.name}.")


if __name__ == "__main__":
    main()
