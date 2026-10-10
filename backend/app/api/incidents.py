import shutil
import uuid
from collections import Counter
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core import store
from app.core.config import settings
from app.core.database import get_database
from app.core.events import broadcaster
from app.services import pipeline

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.post("")
async def submit_report(
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
):
    """
    Submit a report: an image or video, a written description, or both.
    Returns the new incident straight away; analysis continues in the background
    and is pushed live over /api/stream/events.
    """
    has_file = file is not None and bool(file.filename)
    if not has_file and not (text and text.strip()):
        raise HTTPException(status_code=400, detail="Attach an image or video, or describe the problem.")

    file_path = file_url = kind = None
    if has_file:
        kind = pipeline.kind_of(file.filename, file.content_type or "")
        if kind is None:
            raise HTTPException(status_code=400, detail="Unsupported file. Upload an image (jpg, png, webp) or a video (mp4, mov, webm).")
        stored_name = f"{kind}_{uuid.uuid4().hex[:10]}{Path(file.filename).suffix.lower()}"
        file_path = settings.MEDIA_PATH / stored_name
        with open(file_path, "wb") as out:
            shutil.copyfileobj(file.file, out)
        file_url = f"/uploads/media/{stored_name}"

    return await pipeline.create_incident(
        file_path=file_path, file_name=file.filename if has_file else None, kind=kind,
        file_url=file_url, text=text, location=location,
    )


@router.get("")
async def list_incidents(limit: int = 30):
    """Recent reports, newest first (the seeded demo history is left out)."""
    db = get_database()
    incidents = await db.incidents.find({"is_seed": {"$ne": True}}).sort("created_at", -1).limit(limit).to_list(length=limit)
    media_ids = [i["links"]["media_id"] for i in incidents if i["links"].get("media_id")]
    media = {m["_id"]: m async for m in db.media_assets.find({"_id": {"$in": media_ids}})}
    for i in incidents:
        i["media"] = media.get(i["links"].get("media_id"))
    return incidents


@router.get("/{incident_id}")
async def get_incident(incident_id: str):
    """One incident with everything it links to, and the history of how it was written to the database."""
    db = get_database()
    incident = await db.incidents.find_one({"_id": incident_id})
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    links = incident["links"]
    detections = await db.detections.find({"links.incident_id": incident_id}).sort([("severity", -1), ("confidence", -1)]).to_list(length=500)
    media = await db.media_assets.find_one({"_id": links["media_id"]}) if links.get("media_id") else None
    memories = await db.memories.find({"_id": {"$in": links.get("memory_ids", [])}}).to_list(length=10)
    related = await db.incidents.find(
        {"_id": {"$in": links.get("related_incident_ids", [])}},
        {"title": 1, "location": 1, "created_at": 1, "severity": 1},
    ).sort("created_at", -1).to_list(length=10)
    updates = await db.activity_log.find({"links.incident_id": incident_id}).sort("at", 1).to_list(length=500)
    return {"incident": incident, "detections": detections, "media": media, "memories": memories, "related": related, "updates": updates}


@router.delete("/{incident_id}")
async def delete_incident(incident_id: str):
    """Deletes an incident with its detections, file and stored images, and unlinks it everywhere else."""
    db = get_database()
    incident = await db.incidents.find_one({"_id": incident_id})
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    links = incident["links"]

    detections = await db.detections.find({"links.incident_id": incident_id}, {"links": 1, "label": 1}).to_list(length=1000)
    files = [settings.SNAPSHOT_PATH / f"{incident_id}_poster.jpg"] + [settings.SNAPSHOT_PATH / f"{d['_id']}.jpg" for d in detections]
    async for m in db.media_assets.find({"links.incident_id": incident_id}):
        files.append(Path(m["storage_path"]))
        await store.delete("media_assets", m["_id"], summary=f"File removed: {m['file_name']}", incident_id=incident_id)
    for f in files:
        f.unlink(missing_ok=True)

    for d in detections:
        await store.delete("detections", d["_id"], summary=f"Detection removed: {d['label']}", incident_id=incident_id)

    # Undo what this incident added to the other collections.
    for issue_type_id, n in Counter(d["links"]["issue_type_id"] for d in detections).items():
        await store.update("issue_types", issue_type_id, incident_id=incident_id,
                           summary=f"Counters lowered: incident {incident_id} was deleted",
                           inc={"stats.incidents": -1, "stats.detections": -n})
    for memory_id in links.get("memory_ids", []):
        await store.update("memories", memory_id, incident_id=incident_id,
                           summary=f"Unlinked from deleted incident {incident_id}",
                           pull={"links.used_by_incident_ids": incident_id}, inc={"times_used": -1})
    async for other in db.incidents.find({"links.related_incident_ids": incident_id}, {"_id": 1}):
        left = await store.update("incidents", other["_id"], incident_id=incident_id,
                                  summary=f"Unlinked from deleted incident {incident_id}",
                                  pull={"links.related_incident_ids": incident_id})
        if not left["links"]["related_incident_ids"] and left.get("is_recurring"):
            await store.update("incidents", other["_id"], incident_id=incident_id,
                               summary="No earlier reports remain: no longer marked as recurring", set={"is_recurring": False})
    await db.incidents.update_many({"links.duplicate_of": incident_id}, {"$set": {"links.duplicate_of": None}})

    await store.delete("incidents", incident_id, summary=f"Report deleted: {incident.get('title') or incident_id}", incident_id=incident_id)
    await broadcaster.broadcast("deleted", {"incident_id": incident_id})
    return {"status": "deleted", "incident_id": incident_id}
