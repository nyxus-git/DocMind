import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from app.core.config import settings

ph = PasswordHasher(
    time_cost=2,
    memory_cost=65536,
    parallelism=2,
    hash_len=32,
    salt_len=16
)


def hash_password(password: str) -> str:
    """Hashes password using Argon2id."""
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against an Argon2id hash."""
    try:
        return ph.verify(hashed_password, plain_password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def hash_token(token: str) -> str:
    """Creates a SHA-256 hash of a refresh or reset token for DB storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_secure_token(nbytes: int = 32) -> str:
    """Generates a cryptographically secure URL-safe token."""
    return secrets.token_urlsafe(nbytes)


def create_access_token(user_id: str, workspace_id: Optional[str] = None, expires_delta: Optional[timedelta] = None) -> str:
    """Creates a signed short-lived JWT access token."""
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    payload: Dict[str, Any] = {
        "sub": user_id,
        "ws": workspace_id,
        "iat": now,
        "exp": expire,
        "iss": "docmind-api"
    }
    return jwt.encode(payload, settings.APP_SECRET_KEY, algorithm="HS256")


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a JWT access token."""
    try:
        payload = jwt.decode(token, settings.APP_SECRET_KEY, algorithms=["HS256"], issuer="docmind-api")
        return payload
    except jwt.PyJWTError:
        return None
