"""
What the public page is told about a report: enough to show the person who sent it
their upload with what was found, and whether it is registered — and nothing else.
The recommendation, the history, the follow-up and the database record are for the admin page.
"""
from fastapi import APIRouter, HTTPException

from app.core.database import get_database

router = APIRouter(prefix="/public", tags=["public"])

_INCIDENT = (
    "status", "input_type", "created_at", "title", "citizen_text", "location",
    "severity", "severity_label", "departments", "error",
)
_DETECTION = {
    "label": 1, "severity": 1, "severity_label": 1, "confidence": 1, "bbox": 1, "mask": 1,
    "approximate_location": 1, "source": 1, "status": 1, "video": 1, "links.issue_type_id": 1,
}
_MEDIA = {"kind": 1, "file_name": 1, "url": 1, "width": 1, "height": 1, "poster_url": 1, "poster_time_s": 1}


@router.get("/reports/{incident_id}")
async def report_status(incident_id: str):
    """A report as its sender may see it: its state, what was found in it, and the registration message."""
    db = get_database()
    incident = await db.incidents.find_one({"_id": incident_id})
    if not incident:
        raise HTTPException(status_code=404, detail="Report not found")

    registration = incident.get("registration")
    public = {"_id": incident["_id"], **{k: incident.get(k) for k in _INCIDENT}}
    public["analysis"] = {"sample_interval_s": (incident.get("analysis") or {}).get("sample_interval_s")}
    public["registration"] = registration and {
        "state": registration["state"], "message": registration["message"], "report_number": registration["report_number"],
    }

    media_id = incident["links"].get("media_id")
    media = await db.media_assets.find_one({"_id": media_id}, _MEDIA) if media_id else None
    detections = await db.detections.find(
        {"links.incident_id": incident_id, "status": {"$ne": "rejected"}}, _DETECTION,
    ).sort([("severity", -1), ("confidence", -1)]).to_list(length=500)
    return {"incident": public, "media": media, "detections": detections}
