import pytest

from modules.auth.phone import normalize_phone


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("+961 3 123-456", "+9613123456"),
        ("+961 (3) 123.456", "+9613123456"),
        ("00961 3 123 456", "+9613123456"),
        ("  +9613123456  ", "+9613123456"),
    ],
)
def test_normalize_phone_accepts_supported_formats(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "03123456",
        "9613123456",
        "+012345678",
        "+1234567",
        "+1234567890123456",
        "+961-ABC-123",
        "",
    ],
)
def test_normalize_phone_rejects_invalid_numbers(raw):
    with pytest.raises(ValueError):
        normalize_phone(raw)
