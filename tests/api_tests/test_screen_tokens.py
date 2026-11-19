import re

from modules.screens.routes import _token


def test_screen_token_is_url_safe_and_reasonably_long():
    token = _token()

    assert len(token) >= 30
    assert len(token) <= 64
    assert re.fullmatch(r"[A-Za-z0-9_-]+", token)


def test_screen_tokens_are_not_reused():
    tokens = {_token() for _ in range(100)}

    assert len(tokens) == 100
