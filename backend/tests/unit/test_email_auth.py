import asyncio
from datetime import datetime, timezone
from typing import List, Optional
import uuid
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from app.adapters.email.base import EmailProvider
from app.core.exceptions import DocMindException
from app.core.security import (
    create_email_verification_token,
    create_password_reset_token,
    decode_password_reset_token,
    verify_email_verification_token,
    verify_password_reset_token,
)
from app.models.entities import Base, User
from app.models.enums import UserStatus
from app.services.auth import AuthService


class MockEmailProvider:
    def __init__(self):
        self.sent_emails: List[dict] = []
        self.verification_links: List[dict] = []
        self.reset_links: List[dict] = []
        self.invites: List[dict] = []

    async def send_email(self, to_email: str, subject: str, html_content: str, text_content: Optional[str] = None) -> bool:
        self.sent_emails.append({"to": to_email, "subject": subject, "html": html_content})
        return True

    async def send_verification_email(self, to_email: str, verification_link: str) -> bool:
        self.verification_links.append({"to": to_email, "link": verification_link})
        return True

    async def send_password_reset_email(self, to_email: str, reset_link: str) -> bool:
        self.reset_links.append({"to": to_email, "link": reset_link})
        return True

    async def send_member_invite_email(self, to_email: str, inviter_email: str, workspace_name: str, invite_link: str) -> bool:
        self.invites.append({
            "to": to_email,
            "inviter": inviter_email,
            "workspace": workspace_name,
            "link": invite_link
        })
        return True


def test_email_verification_token_cycle():
    user_id = str(uuid.uuid4())
    token = create_email_verification_token(user_id)
    assert token is not None

    decoded_id = verify_email_verification_token(token)
    assert decoded_id == user_id

    # Tampered token returns None
    assert verify_email_verification_token(token + "tampered") is None
    assert verify_email_verification_token("invalid-garbage-token") is None


def test_password_reset_token_single_use():
    user_id = str(uuid.uuid4())
    current_hash = "$argon2id$v=19$m=65536,t=2,p=2$originalhashvalue"
    token = create_password_reset_token(user_id, current_hash)
    assert token is not None

    # Valid check
    decoded_id = verify_password_reset_token(token, current_hash)
    assert decoded_id == user_id

    # Password hash changed after reset -> invalidates old token
    new_hash = "$argon2id$v=19$m=65536,t=2,p=2$newchangedhashval"
    assert verify_password_reset_token(token, new_hash) is None

    # Payload decode check
    payload = decode_password_reset_token(token)
    assert payload is not None
    assert payload["sub"] == user_id
    assert payload["action"] == "reset_password"


async def _run_test_auth_service_verification():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    mock_email = MockEmailProvider()
    async_session = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with async_session() as session:
        auth_service = AuthService(session, email_provider=mock_email)

        # 1. Register user
        user, workspace, verification_token = await auth_service.register(
            email="alice@meridian.com",
            password="SecurePassword123!"
        )
        await session.commit()

        assert user.status == UserStatus.UNVERIFIED.value
        assert len(mock_email.verification_links) == 1
        assert mock_email.verification_links[0]["to"] == "alice@meridian.com"
        assert verification_token in mock_email.verification_links[0]["link"]

        # 2. Verify email
        verified_user = await auth_service.verify_email(verification_token)
        await session.commit()

        assert verified_user.status == UserStatus.ACTIVE.value
        assert verified_user.verified_at is not None

        # 3. Invalid token fails
        with pytest.raises(DocMindException) as exc:
            await auth_service.verify_email("invalid.token.here")
        assert exc.value.status_code == 400


def test_auth_service_verification():
    asyncio.run(_run_test_auth_service_verification())


async def _run_test_auth_service_forgot_and_reset_password():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    mock_email = MockEmailProvider()
    async_session = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with async_session() as session:
        auth_service = AuthService(session, email_provider=mock_email)

        # Register user
        user, _, _ = await auth_service.register(
            email="bob@compliance.org",
            password="InitialPassword123!"
        )
        await session.commit()

        # Nonexistent user forgot password returns without error (anti-enumeration)
        await auth_service.forgot_password("unknown@corp.com")
        assert len(mock_email.reset_links) == 0

        # Existing user forgot password dispatches email
        await auth_service.forgot_password("bob@compliance.org")
        assert len(mock_email.reset_links) == 1
        reset_entry = mock_email.reset_links[0]
        assert reset_entry["to"] == "bob@compliance.org"
        assert "token=" in reset_entry["link"]

        # Extract token from link
        link = reset_entry["link"]
        token = link.split("token=")[1].split("&")[0]

        # Reset password to new password
        await auth_service.reset_password(token, "BrandNewPassword456!")
        await session.commit()

        # Login with old password fails
        with pytest.raises(DocMindException) as exc1:
            await auth_service.login("bob@compliance.org", "InitialPassword123!")
        assert exc1.value.status_code == 401

        # Login with new password succeeds
        token_resp, _, _ = await auth_service.login("bob@compliance.org", "BrandNewPassword456!")
        assert token_resp.access_token is not None

        # Reusing the same reset token is rejected (single use)
        with pytest.raises(DocMindException) as exc2:
            await auth_service.reset_password(token, "AnotherPassword789!")
        assert exc2.value.status_code == 400
        assert exc2.value.code == "TOKEN_ALREADY_USED"


def test_auth_service_forgot_and_reset_password():
    asyncio.run(_run_test_auth_service_forgot_and_reset_password())

