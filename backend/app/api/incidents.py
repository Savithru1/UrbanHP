import os
import uuid
import shutil
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from pydantic import BaseModel

from app.core.database import get_database
from app.core.config import settings
from app.core.events import broadcaster
from app.services.ingestion_service import IngestionService
from app.services.vector_search_service import VectorSearchService
from app.services.recommendation_service import RecommendationService
from app.models.incident import IncidentVerifyUpdate, IncidentCreateText

router = APIRouter(prefix="/incidents", tags=["incidents"])

@router.get("")
@router.get("/")
async def list_incidents(limit: int = 50, category: Optional[str] = None):
    db = get_database()
    query = {}
    if category and category != "all":
        query["incident_type"] = category
    cursor = db.incidents.find(query).sort("created_at", -1).limit(limit)
    incidents = await cursor.to_list(length=limit)
    return incidents

@router.get("/{incident_id}")
async def get_incident(incident_id: str):
    db = get_database()
    incident = await db.incidents.find_one({"_id": incident_id})
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found in MongoDB")
    return incident

@router.post("/text")
async def create_text_incident(payload: IncidentCreateText):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Text complaint cannot be empty")
    doc = await IngestionService.process_text_input(payload.text, location=payload.location or "Ward 4, Sector 7")
    return doc

@router.post("/upload")
async def upload_media_incident(
    file: UploadFile = File(...),
    input_type: str = Form(...), # image, video, voice
    location: str = Form("Ward 4, Sector 7")
):
    if input_type not in ["image", "video", "voice"]:
        raise HTTPException(status_code=400, detail="Invalid input_type. Allowed: image, video, voice")
    
    ext = Path(file.filename or "").suffix.lower()
    if not ext:
        if input_type == "image":
            ext = ".jpg"
        elif input_type == "video":
            ext = ".mp4"
        elif input_type == "voice":
            ext = ".wav"
            
    unique_filename = f"{input_type}_{uuid.uuid4().hex[:8]}{ext}"
    dest_path = settings.MEDIA_PATH / unique_filename
    
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    file_url = f"/uploads/media/{unique_filename}"
    
    doc = await IngestionService.process_media_upload(
        input_type=input_type,
        file_path=dest_path,
        file_url=file_url,
        original_filename=file.filename or unique_filename,
        location=location
    )
    return doc

@router.post("/{incident_id}/re-evaluate")
async def re_evaluate_incident(incident_id: str):
    """
    ACT 5 OF HACKATHON DEMO:
    Re-evaluates an incident against the latest City Memory.
    If a memory was updated in MongoDB Compass, this will fetch the updated
    protocol and generate an updated recommendation with full transparent reasoning!
    """
    db = get_database()
    incident = await db.incidents.find_one({"_id": incident_id})
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found in MongoDB")
        
    old_recommendation = incident.get("recommendation")
    category = incident.get("incident_type", "pothole")
    severity = incident.get("severity", "medium")
    extracted_text = incident.get("extracted_text") or incident.get("raw_content") or ""
    evidence_summary = incident.get("evidence_summary", {})
    
    # Re-query memories via Vector Search
    matched_memories = await VectorSearchService.search_memories(extracted_text, incident_type=category, top_k=2)
    memory_ids = [m["_id"] for m in matched_memories]
    
    new_recommendation, new_reasoning = RecommendationService.generate_recommendation(
        incident_type=category,
        extracted_text=extracted_text,
        severity=severity,
        evidence_summary=evidence_summary,
        matched_memories=matched_memories
    )
    
    stages = incident.get("processing_stages", [])
    stages.append({
        "stage": "re-evaluated",
        "timestamp": datetime.utcnow().isoformat() if hasattr(datetime, 'utcnow') else "",
        "detail": f"Re-evaluated against updated memory ({len(matched_memories)} retrieved)"
    })
    
    new_version = incident.get("version", 1) + 1
    
    # Record evaluation audit
    eval_id = f"eval_{uuid.uuid4().hex[:8]}"
    eval_record = {
        "_id": eval_id,
        "incident_id": incident_id,
        "memory_ids_used": memory_ids,
        "previous_recommendation": old_recommendation,
        "new_recommendation": new_recommendation,
        "reasoning_trace": new_reasoning,
        "changed_due_to_memory_update": (old_recommendation != new_recommendation),
        "created_at": datetime.utcnow()
    }
    await db.evaluations.insert_one(eval_record)
    
    # Update incident in MongoDB
    await db.incidents.update_one(
        {"_id": incident_id},
        {"$set": {
            "related_memory_ids": memory_ids,
            "recommendation": new_recommendation,
            "reasoning_trace": new_reasoning,
            "version": new_version,
            "processing_stages": stages,
            "updated_at": datetime.utcnow()
        }}
    )
    
    updated = await db.incidents.find_one({"_id": incident_id})
    await broadcaster.broadcast("incident_update", updated)
    return {
        "status": "success",
        "incident": updated,
        "evaluation": eval_record
    }

from datetime import datetime

@router.patch("/{incident_id}/verify")
async def verify_incident(incident_id: str, payload: IncidentVerifyUpdate):
    db = get_database()
    incident = await db.incidents.find_one({"_id": incident_id})
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found in MongoDB")
        
    update_data = {
        "verification_status": payload.verification_status,
        "updated_at": datetime.utcnow(),
        "version": incident.get("version", 1) + 1
    }
    if payload.corrected_category:
        update_data["incident_type"] = payload.corrected_category
    if payload.corrected_severity:
        update_data["severity"] = payload.corrected_severity
        
    stages = incident.get("processing_stages", [])
    stages.append({
        "stage": "verified" if payload.verification_status == "verified" else "corrected",
        "timestamp": datetime.utcnow().isoformat(),
        "detail": f"Inspector verified status as: {payload.verification_status}"
    })
    update_data["processing_stages"] = stages
    
    await db.incidents.update_one({"_id": incident_id}, {"$set": update_data})
    updated = await db.incidents.find_one({"_id": incident_id})
    await broadcaster.broadcast("incident_update", updated)
    return updated

@router.delete("/{incident_id}")
async def delete_incident(incident_id: str):
    db = get_database()
    res = await db.incidents.delete_one({"_id": incident_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Incident not found in MongoDB")
    await broadcaster.broadcast("incident_deleted", {"_id": incident_id})
    return {"status": "deleted", "incident_id": incident_id}
