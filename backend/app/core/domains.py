import re
from typing import Iterable, List, Optional

RESERVED_PORTAL_SLUGS = frozenset({
    "app",
    "admin",
    "auth",
    "company",
    "employee",
    "login",
    "signup",
    "org",
    "portal",
    "api",
    "health",
    "docs",
    "openapi",
    "redoc",
    "pricing",
    "privacy",
    "terms",
    "static",
    "_next",
})


def sanitize_company_slug(raw: str, fallback: str = "company") -> str:
    """Produces a URL-safe lowercase slug that never collides with reserved application routes."""
    cleaned = re.sub(r"[^a-z0-9]+", "-", (raw or "").strip().lower()).strip("-")
    if not cleaned:
        return fallback
    if cleaned in RESERVED_PORTAL_SLUGS:
        return f"{cleaned}-org"
    return cleaned[:100]

# Well-known consumer / free webmail providers that cannot be claimed as exclusive company domains.
PUBLIC_EMAIL_DOMAINS = frozenset({
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "yahoo.co.in",
    "yahoo.co.uk",
    "ymail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "msn.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "proton.me",
    "protonmail.com",
    "aol.com",
    "zoho.com",
    "gmx.com",
    "mail.com",
    "yandex.com",
    "rediffmail.com",
    "example.com",
    "test.com",
})


def extract_email_domain(email: str) -> Optional[str]:
    """Extracts normalized lowercase domain from an email address."""
    cleaned = (email or "").strip().lower()
    if "@" not in cleaned:
        return None
    _, domain = cleaned.rsplit("@", 1)
    domain = domain.strip()
    return domain if "." in domain and " " not in domain else None


def is_corporate_domain(domain: Optional[str]) -> bool:
    """Returns True if domain is valid and not a public consumer email provider."""
    if not domain:
        return False
    norm = domain.strip().lower().lstrip("@")
    if not norm or "." not in norm or any(ch.isspace() for ch in norm):
        return False
    return norm not in PUBLIC_EMAIL_DOMAINS


def normalize_corporate_domains(domains: Iterable[str]) -> List[str]:
    """Deduplicates and validates corporate domain strings, rejecting public webmail domains."""
    normalized: List[str] = []
    seen = set()
    for raw in domains:
        d = (raw or "").strip().lower().lstrip("@")
        if not d:
            continue
        if not is_corporate_domain(d):
            raise ValueError(
                f"Domain '{d}' is a public or invalid email domain and cannot be claimed for a company."
            )
        if d not in seen:
            seen.add(d)
            normalized.append(d)
    return normalized

