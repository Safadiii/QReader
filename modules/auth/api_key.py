"""
Only our own web server may call this API.

The web app (Next.js) is the one public door: it checks staff sessions and
talks to this API from its server with a shared secret. Without the secret a
request is refused, so the staff routes are not open to the internet.
"""

import hmac
import os

from dotenv import load_dotenv
from fastapi import Header, HTTPException

load_dotenv()

API_KEY = os.getenv("API_KEY", "")

if not API_KEY:
    print("WARNING: API_KEY is not set. The API accepts every request. Never deploy like this.")


def require_api_key(x_api_key: str = Header(default="")) -> None:
    if API_KEY and not hmac.compare_digest(x_api_key.encode(), API_KEY.encode()):
        raise HTTPException(status_code=401, detail="Missing or wrong API key")
