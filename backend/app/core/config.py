import json
from typing import Any, List, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "docmind-super-secret-key-at-least-32-chars-long!"
    DATABASE_URL: str = "postgresql+asyncpg://docmind:docmind@localhost:5432/docmind"
    SYNC_DATABASE_URL: str = "postgresql+psycopg2://docmind:docmind@localhost:5432/docmind"
    PUBLIC_APP_URL: str = "http://localhost:3001"
    API_BASE_URL: str = "http://localhost:8000"
    CORS_ALLOWED_ORIGINS: List[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
        ]
    )
    CORS_ORIGIN_REGEX: Optional[str] = None

    @field_validator("CORS_ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            v_trimmed = v.strip()
            if v_trimmed.startswith("[") and v_trimmed.endswith("]"):
                try:
                    parsed = json.loads(v_trimmed)
                    if isinstance(parsed, list):
                        return [str(o).strip() for o in parsed if str(o).strip()]
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        elif isinstance(v, (list, tuple, set)):
            return [str(origin).strip() for origin in v if str(origin).strip()]
        return v

    @property
    def effective_cors_origins(self) -> List[str]:
        origins = list(self.CORS_ALLOWED_ORIGINS)
        if self.PUBLIC_APP_URL and self.PUBLIC_APP_URL not in origins:
            origins.append(self.PUBLIC_APP_URL)
        return origins

    # Cloudflare R2 / S3 Object Storage
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET: str = "docmind-private"
    R2_ENDPOINT_URL: str = ""

    # Google Gemini AI
    GOOGLE_API_KEY: str = ""
    LLM_PROVIDER: str = "google"
    LLM_MODEL: str = "gemini-3.5-flash"
    EMBEDDING_PROVIDER: str = "google"
    EMBEDDING_MODEL: str = "gemini-embedding-001"
    EMBEDDING_DIMENSION: int = 768

    # Governance & Budget Controls
    AI_FEATURES_ENABLED: bool = True
    AI_MONTHLY_BUDGET_USD: float = 50.0
    MAX_FILE_MB: int = 20
    MAX_PAGES: int = 200
    MAX_WORKSPACE_DOCS: int = 20
    MAX_WORKSPACE_STORAGE_MB: int = 200
    MONTHLY_QUESTION_LIMIT: int = 100
    WORKER_CONCURRENCY: int = 1

    # Security
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    VERIFICATION_TOKEN_EXPIRE_HOURS: int = 24
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 60

    # Transactional Email & SMTP
    EMAIL_ENABLED: bool = True
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "docmindofficial@gmail.com"
    SMTP_FROM_NAME: str = "DocMind Support"
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False


settings = Settings()
