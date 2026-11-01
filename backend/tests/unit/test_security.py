import pytest
from app.core.security import (
    create_access_token,
    decode_access_token,
    generate_secure_token,
    hash_password,
    hash_token,
    verify_password,
)


def test_argon2id_password_hashing():
    raw_pass = "CompliancePassword2026!"
    hashed = hash_password(raw_pass)

    assert hashed.startswith("$argon2id$")
    assert verify_password(raw_pass, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_token_hashing_and_randomness():
    tok1 = generate_secure_token(32)
    tok2 = generate_secure_token(32)

    assert tok1 != tok2
    h1 = hash_token(tok1)
    h2 = hash_token(tok2)
    assert len(h1) == 64
    assert h1 != h2
    assert h1 == hash_token(tok1)


def test_jwt_access_token_creation_and_decoding():
    user_id = "11111111-1111-1111-1111-111111111111"
    ws_id = "22222222-2222-2222-2222-222222222222"

    token = create_access_token(user_id=user_id, workspace_id=ws_id)
    payload = decode_access_token(token)

    assert payload is not None
    assert payload["sub"] == user_id
    assert payload["ws"] == ws_id
    assert payload["iss"] == "docmind-api"
