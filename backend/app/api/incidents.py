import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.core import store
from app.core.config import settings
from app.core.database import get_database
from app.core.events import broadcaster
from app.services import linker, pipeline

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.post("")
async def submit_report(
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None, ge=-90, le=90),
    longitude: Optional[float] = Form(None, ge=-180, le=180),
    accuracy_m: Optional[float] = Form(None, ge=0),
    location_source: Optional[str] = Form(None),
):
    """
    Submit a report: an image or video, a written description, or both — optionally with
    the position it was pinned at (from the device's GPS, or placed on the map by hand).
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
        latitude=latitude, longitude=longitude, accuracy_m=accuracy_m, location_source=location_source,
    )


async def _with_media(incidents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Attaches each incident's file, so a list can show a thumbnail."""
    db = get_database()
    media_ids = [i["links"]["media_id"] for i in incidents if i["links"].get("media_id")]
    media = {m["_id"]: m async for m in db.media_assets.find({"_id": {"$in": media_ids}})}
    for i in incidents:
        i["media"] = media.get(i["links"].get("media_id"))
    return incidents


@router.get("")
async def list_incidents(limit: int = Query(30, ge=1, le=500)):
    """Recent reports, newest first (the seeded demo history is left out)."""
    db = get_database()
    incidents = await db.incidents.find({"is_seed": {"$ne": True}}).sort("created_at", -1).limit(limit).to_list(length=limit)
    return await _with_media(incidents)


@router.get("/search")
async def search_reports(q: str = Query(..., min_length=1, max_length=120), limit: int = Query(30, ge=1, le=100)):
    """Past reports that match a few words — by keyword, by a fragment of the place, or by meaning. Best match first."""
    db = get_database()
    hits = await linker.search_incidents(q, limit)
    found = {i["_id"]: i async for i in db.incidents.find({"_id": {"$in": [h["_id"] for h in hits]}})}
    incidents = [{**found[h["_id"]], "match": {"score": h["score"], "why": h["why"]}} for h in hits if h["_id"] in found]
    return await _with_media(incidents)


@router.get("/{incident_id}")
async def get_incident(incident_id: str):
    """One incident with everything it links to, its history, and the record of how it was written to the database."""
    db = get_database()
    incident = await db.incidents.find_one({"_id": incident_id})
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    links = incident["links"]
    detections = await db.detections.find({"links.incident_id": incident_id}).sort([("severity", -1), ("confidence", -1)]).to_list(length=500)
    media = await db.media_assets.find_one({"_id": links["media_id"]}) if links.get("media_id") else None
    memories = await db.memories.find({"_id": {"$in": links.get("memory_ids", [])}}).to_list(length=10)

    # A report filed under a case that was already open: follow-up lives on the case.
    registration = incident.get("registration") or {}
    case = None
    if registration.get("state") == "already_registered":
        case = await db.incidents.find_one(
            {"_id": registration["case_id"]},
            {"title": 1, "location": 1, "created_at": 1, "work_status": 1, "report_count": 1, "departments": 1},
        )

    # History, read live so it always shows what is known now: this place first, then similar cases elsewhere.
    related = await linker.find_related_incidents(incident_id, links.get("issue_type_ids", []), incident.get("location_key"), incident.get("geo"))
    tried = await linker.attempts_for([r["_id"] for r in related])
    history = {
        "here": linker.present_here(related, tried),
        "similar": await linker.find_similar_cases(incident_id, links.get("issue_type_ids", []), incident.get("citizen_text"),
                                                  incident.get("geo"), [r["_id"] for r in related]),
    }

    # What was done about it, each action with what an inspector found afterwards.
    actions = await db.actions.find({"links.incident_id": incident_id}).sort("created_at", 1).to_list(length=50)
    outcomes = await db.outcomes.find({"links.incident_id": incident_id}).sort("created_at", 1).to_list(length=100)
    for a in actions:
        a["outcomes"] = [o for o in outcomes if o["links"]["action_id"] == a["_id"]]
    lessons = await db.memories.find({"links.learned_from_incident_ids": incident_id}).sort("created_at", 1).to_list(length=20)

    updates = await db.activity_log.find({"links.incident_id": incident_id}).sort("at", 1).to_list(length=500)
    return {
        "incident": incident, "detections": detections, "media": media, "memories": memories, "case": case,
        "history": history, "actions": actions, "lessons": lessons, "updates": updates,
    }


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

    # What was done about it goes too; lessons drawn from it are kept, without the links.
    async for o in db.outcomes.find({"links.incident_id": incident_id}, {"_id": 1}):
        await db.memories.update_many({"links.outcome_ids": o["_id"]}, {"$pull": {"links.outcome_ids": o["_id"]}})
        await store.delete("outcomes", o["_id"], summary="Outcome removed", incident_id=incident_id)
    async for a in db.actions.find({"links.incident_id": incident_id}, {"_id": 1}):
        await db.memories.update_many({"links.action_ids": a["_id"]}, {"$pull": {"links.action_ids": a["_id"]}})
        await store.delete("actions", a["_id"], summary="Action removed", incident_id=incident_id)
    await db.memories.update_many({"links.learned_from_incident_ids": incident_id}, {"$pull": {"links.learned_from_incident_ids": incident_id}})

    # Undo what this incident added to the other collections.
    for issue_type_id in links.get("issue_type_ids", []):
        await store.update("issue_types", issue_type_id, incident_id=incident_id,
                           summary=f"Counters lowered: incident {incident_id} was deleted",
                           set={
                               "stats.incidents": await db.incidents.count_documents({"links.issue_type_ids": issue_type_id, "_id": {"$ne": incident_id}}),
                               "stats.detections": await db.detections.count_documents({"links.issue_type_id": issue_type_id, "status": {"$ne": "rejected"}}),
                           })
    for memory_id in links.get("memory_ids", []):
        await store.update("memories", memory_id, incident_id=incident_id,
                           summary=f"Unlinked from deleted incident {incident_id}",
                           pull={"links.used_by_incident_ids": incident_id}, inc={"times_used": -1})
    await db.incidents.update_many({"links.duplicate_of": incident_id}, {"$set": {"links.duplicate_of": None}})

    # Reports that pointed at it are worked out again without it, oldest first: if it was the case
    # others were filed under, the earliest of them becomes the case.
    affected = await db.incidents.find(
        {"_id": {"$ne": incident_id}, "$or": [{"links.related_incident_ids": incident_id}, {"registration.case_id": incident_id}]},
        {"_id": 1},
    ).sort("created_at", 1).to_list(length=200)
    await db.incidents.update_many({"links.related_incident_ids": incident_id}, {"$pull": {"links.related_incident_ids": incident_id}})

    await store.delete("incidents", incident_id, summary=f"Report deleted: {incident.get('title') or incident_id}", incident_id=incident_id)
    for other in affected:
        await pipeline.reevaluate(other["_id"], f"Report {incident_id} was deleted")
    registration = incident.get("registration") or {}
    if registration.get("state") == "already_registered":
        await pipeline.sync_case(registration["case_id"])

    await broadcaster.broadcast("deleted", {"incident_id": incident_id})
    return {"status": "deleted", "incident_id": incident_id}
