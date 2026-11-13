import os
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .schema import Base

load_dotenv()

def database_url() -> str:
    """Hosts like Render hand out postgres:// URLs; SQLAlchemy needs the driver named."""
    url = os.environ["DATABASE_URL"]
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = database_url()

engine = create_engine(DATABASE_URL, pool_pre_ping=True, echo=False)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session

def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    print("DATABASE INITIALIZED SUCCESSFULLY")

if __name__ == "__main__":
    init_db()