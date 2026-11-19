from modules.auth.passwords import hash_password, verify_password


def test_hash_password_round_trip():
    stored = hash_password("correct horse battery staple")

    assert stored.startswith("scrypt$")
    assert stored != "correct horse battery staple"
    assert verify_password("correct horse battery staple", stored) is True
    assert verify_password("wrong password", stored) is False


def test_hash_password_uses_random_salt():
    first = hash_password("same-password")
    second = hash_password("same-password")

    assert first != second
    assert verify_password("same-password", first)
    assert verify_password("same-password", second)


def test_verify_password_rejects_malformed_hashes():
    for stored in (
        "",
        "plain-text",
        "bcrypt$something",
        "scrypt$bad",
        "scrypt$32768$8$2$nothex$nothex",
    ):
        assert verify_password("password", stored) is False
