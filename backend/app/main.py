import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import connect_to_mongo, close_mongo_connection
from app.services.seed_service import seed_initial_data
from app.api import incidents, memories, stats, stream

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("urbanhp.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB & seed initial memories
    logger.info("Initializing UrbanHP Intelligence Engine...")
    await connect_to_mongo()
    await seed_initial_data()
    yield
    # Shutdown
    logger.info("Shutting down UrbanHP Engine...")
    await close_mongo_connection()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Multimodal Urban Intelligence System connecting civic evidence to persistent MongoDB memory.",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving for uploads (images, audio, video keyframes)
app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_PATH)), name="uploads")

# Include Routers
app.include_router(incidents.router, prefix="/api")
app.include_router(memories.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(stream.router, prefix="/api")

@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": {
            "target": settings.MONGODB_URL,
            "database": settings.DATABASE_NAME,
            "status": "connected"
        }
    }
