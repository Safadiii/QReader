"""Phone numbers are the staff login, so they are stored one way: +<country code><number>."""

import re


def normalize_phone(raw: str) -> str:
    """'+961 3 123-456' -> '+9613123456'. Raises ValueError for anything else.

    The country code is required (no guessing from a leading 0), so a number can
    never match a different person's in another country.
    """
    text = raw.strip()
    if text.startswith("00"):
        text = "+" + text[2:]
    if not text.startswith("+"):
        raise ValueError("Start the number with the country code, e.g. +961 3 123 456.")
    digits = re.sub(r"[\s().-]", "", text[1:])
    if not digits.isdigit() or not 8 <= len(digits) <= 15 or digits.startswith("0"):
        raise ValueError("That does not look like a phone number.")
    return "+" + digits
