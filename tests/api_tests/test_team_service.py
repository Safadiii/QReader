import re

from modules.team.services import new_password


def test_generated_password_has_expected_length_and_safe_alphabet():
    password = new_password()

    assert len(password) == 10
    assert re.fullmatch(
        r"[abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}",
        password,
    )


def test_generated_password_excludes_ambiguous_characters():
    for _ in range(50):
        password = new_password()
        assert not any(char in password for char in "0O1lI")
