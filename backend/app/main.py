import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import incidents, stream
from app.core.config import settings
from app.core.database import close_mongo_connection, connect_to_mongo, get_database
from app.services.detector import detector
from app.services.embedder import embedder
from app.services.seed_service import seed_initial_data

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("urbanhp.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    await asyncio.to_thread(embedder.load)
    await seed_initial_data()
    # The detector is large; load it in the background so the API is up immediately.
    loading = asyncio.create_task(asyncio.to_thread(detector.load))
    yield
    loading.cancel()
    await close_mongo_connection()


app = FastAPI(title=settings.PROJECT_NAME, version=settings.VERSION, lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_PATH)), name="uploads")
app.include_router(incidents.router, prefix="/api")
app.include_router(stream.router, prefix="/api")


@app.get("/api/health")
async def health():
    db = get_database()
    try:
        await db.command("ping")
        connected = True
    except Exception:
        connected = False
    return {
        "database": {"connected": connected, "url": settings.MONGODB_URL, "name": settings.DATABASE_NAME},
        "detector": {"status": detector.status, "error": detector.error, **detector.describe()},
    }
