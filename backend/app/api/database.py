"""
The database as the admin page shows it: how many documents each collection holds,
and the most recent writes from `activity_log`. Newer writes then arrive one by one
over /api/stream/events (event "update"), so the page stays current without asking again.
"""
from fastapi import APIRouter, Query

from app.core.config import settings
from app.core.database import COLLECTIONS, get_database

router = APIRouter(tags=["database"])


@router.get("/database")
async def overview(limit: int = Query(150, ge=1, le=500)):
    db = get_database()
    collections = [{"name": name, "count": await db[name].estimated_document_count()} for name in COLLECTIONS]
    activity = await db.activity_log.find().sort("at", -1).limit(limit).to_list(length=limit)
    return {"database": settings.DATABASE_NAME, "collections": collections, "activity": activity}
