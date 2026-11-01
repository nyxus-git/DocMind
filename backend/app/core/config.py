from typing import List
from pydantic import Field
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
    API_BASE_URL: str = "http://localhost:8001"
    CORS_ALLOWED_ORIGINS: List[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
        ]
    )

    # Cloudflare R2 / S3 Object Storage
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET: str = "docmind-private"
    R2_ENDPOINT_URL: str = ""

    # Google Gemini AI
    GOOGLE_API_KEY: str = ""
    LLM_PROVIDER: str = "google"
    LLM_MODEL: str = "gemini-3.8-flash"
    EMBEDDING_PROVIDER: str = "google"
    EMBEDDING_MODEL: str = "gemini-embedding-2"
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


settings = Settings()
