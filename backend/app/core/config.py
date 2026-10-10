from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
MEDIA_DIR = UPLOAD_DIR / "media"
SNAPSHOT_DIR = UPLOAD_DIR / "snapshots"
for _d in (UPLOAD_DIR, MEDIA_DIR, SNAPSHOT_DIR):
    _d.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "UrbanHP"
    VERSION: str = "2.0.0"

    # MongoDB — defaults to the local server that MongoDB Compass connects to.
    MONGODB_URL: str = "mongodb://127.0.0.1:27017"
    DATABASE_NAME: str = "urbanhp"

    # Vision models (downloaded once from Hugging Face):
    # a zero-shot classifier decides what is in the picture, a box detector says where.
    CLASSIFIER_MODEL: str = "google/siglip2-base-patch16-384"
    DETECTOR_MODEL: str = "IDEA-Research/grounding-dino-base"
    # Turns each detected box into the exact outline of the object.
    SEGMENTER_MODEL: str = "facebook/sam2.1-hiera-tiny"
    # Models fine-tuned by training/train.py (pothole-seg.pt, crack-seg.pt). Optional:
    # an issue without a trained model here is found zero-shot like everything else.
    MODELS_PATH: Path = BASE_DIR / "models"
    # Text: sentence embedding model used to link reports with city memory.
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    # "auto" picks the GPU when one is available.
    DEVICE: str = "auto"

    # Video: frames analysed per second of footage, and a cap for long clips.
    VIDEO_SAMPLE_FPS: float = 2.0
    VIDEO_MAX_FRAMES: int = 120

    UPLOAD_PATH: Path = UPLOAD_DIR
    MEDIA_PATH: Path = MEDIA_DIR
    SNAPSHOT_PATH: Path = SNAPSHOT_DIR


settings = Settings()
