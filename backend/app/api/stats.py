from fastapi import APIRouter
from app.core.database import get_database

router = APIRouter(prefix="/stats", tags=["stats"])

@router.get("/overview")
async def get_system_overview():
    db = get_database()
    
    total_incidents = await db.incidents.count_documents({})
    completed_incidents = await db.incidents.count_documents({"processing_status": "completed"})
    verified_incidents = await db.incidents.count_documents({"verification_status": "verified"})
    total_memories = await db.memories.count_documents({})
    total_actions = await db.actions.count_documents({})
    total_outcomes = await db.outcomes.count_documents({})
    
    # Input types breakdown
    pipeline_types = [
        {"$group": {"_id": "$input_type", "count": {"$sum": 1}}}
    ]
    type_counts_cursor = db.incidents.aggregate(pipeline_types)
    type_counts = {doc["_id"]: doc["count"] async for doc in type_counts_cursor}
    
    # Category breakdown
    pipeline_cat = [
        {"$group": {"_id": "$incident_type", "count": {"$sum": 1}}}
    ]
    cat_counts_cursor = db.incidents.aggregate(pipeline_cat)
    category_counts = {doc["_id"]: doc["count"] async for doc in cat_counts_cursor}
    
    # Severity breakdown
    pipeline_sev = [
        {"$group": {"_id": "$severity", "count": {"$sum": 1}}}
    ]
    sev_counts_cursor = db.incidents.aggregate(pipeline_sev)
    severity_counts = {doc["_id"]: doc["count"] async for doc in sev_counts_cursor}
    
    return {
        "metrics": {
            "total_incidents": total_incidents,
            "completed_rate": round((completed_incidents / max(total_incidents, 1)) * 100, 1),
            "verified_count": verified_incidents,
            "total_memories": total_memories,
            "historical_actions": total_actions,
            "recorded_outcomes": total_outcomes
        },
        "by_input_type": {
            "image": type_counts.get("image", 0),
            "video": type_counts.get("video", 0),
            "voice": type_counts.get("voice", 0),
            "text": type_counts.get("text", 0)
        },
        "by_category": category_counts,
        "by_severity": severity_counts,
        "database_info": {
            "connected": True,
            "host": "127.0.0.1:27017",
            "database": "urbanhp"
        }
    }
