import logging
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import MongoClient
from app.core.config import settings

logger = logging.getLogger("urbanhp.db")

class Database:
    client: AsyncIOMotorClient | None = None
    sync_client: MongoClient | None = None
    db: AsyncIOMotorDatabase | None = None

db_instance = Database()

async def connect_to_mongo():
    logger.info(f"Connecting to MongoDB at {settings.MONGODB_URL} (db: {settings.DATABASE_NAME})...")
    try:
        db_instance.client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=4000
        )
        db_instance.db = db_instance.client[settings.DATABASE_NAME]
        
        # Test connection ping
        await db_instance.db.command("ping")
        logger.info(f"Successfully connected to MongoDB database '{settings.DATABASE_NAME}'!")
        print(f"\n=======================================================")
        print(f" [UrbanHP MongoDB Engine Connected]")
        print(f" - Connection URI: {settings.MONGODB_URL}")
        print(f" - Target Database: {settings.DATABASE_NAME}")
        print(f" - Open MongoDB Compass and connect to:")
        print(f"   {settings.MONGODB_URL}/{settings.DATABASE_NAME}")
        print(f"=======================================================\n")
        
        # Ensure indexes
        await init_db_indexes()
        
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        print(f"\n[WARNING] MongoDB connection failed: {e}")
        print("Please ensure your local MongoDB service is running on port 27017 or set MONGODB_URL in .env\n")
        raise e

async def close_mongo_connection():
    if db_instance.client:
        logger.info("Closing MongoDB connection...")
        db_instance.client.close()

async def init_db_indexes():
    """Initializes indexes across core UrbanHP collections."""
    db = db_instance.db
    if db is None:
        return
    
    try:
        # Incidents indexes
        await db.incidents.create_index([("created_at", -1)])
        await db.incidents.create_index([("incident_type", 1)])
        await db.incidents.create_index([("processing_status", 1)])
        
        # Media assets
        await db.media_assets.create_index([("incident_id", 1)])
        
        # Memories
        await db.memories.create_index([("incident_type", 1)])
        await db.memories.create_index([("is_validated", 1)])
        
        # Actions & Outcomes
        await db.actions.create_index([("incident_id", 1)])
        await db.outcomes.create_index([("incident_id", 1)])
        
        logger.info("MongoDB indexes verified.")
    except Exception as e:
        logger.warning(f"Error creating indexes: {e}")

def get_database() -> AsyncIOMotorDatabase:
    if db_instance.db is None:
        raise RuntimeError("Database is not initialized. Call connect_to_mongo() first.")
    return db_instance.db
