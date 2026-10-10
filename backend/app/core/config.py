import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MEDIA_DIR = UPLOAD_DIR / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseSettings):
    PROJECT_NAME: str = "UrbanHP — The City That Never Forgets"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # MongoDB Configuration
    # Defaults to local MongoDB Compass instance (port 27017)
    # Can also be overridden with MongoDB Atlas connection string
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://127.0.0.1:27017")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "urbanhp")
    
    # Upload and static directories
    UPLOAD_PATH: Path = UPLOAD_DIR
    MEDIA_PATH: Path = MEDIA_DIR
    
    # Optional AI Keys (system will work offline with local heuristic models if not set)
    OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY", None)
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY", None)
    
    # Server config
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    DEBUG: bool = True
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
