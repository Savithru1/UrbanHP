"""
What people do with a report after it has been analysed:

  - check a detection                  (confirmed / rejected)
  - record what was done about it      -> actions
  - record how that turned out         -> outcomes
  - say whether the advice was useful  -> incidents.feedback

Each of these can change what the report's recommendation should be, so the
report is re-evaluated afterwards.
"""
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core import store
from app.core.database import get_database, work_status_of
from app.core.events import broadcaster
from app.core.store import now
from app.services import pipeline

router = APIRouter(tags=["workflow"])


class Verification(BaseModel):
    status: Literal["open", "confirmed", "rejected"]


class ActionIn(BaseModel):
    action_type: str = Field(min_length=2, max_length=60)
    notes: str = Field(min_length=3, max_length=600)
    assigned_department: Optional[str] = Field(None, max_length=80)
    contractor: Optional[str] = Field(None, max_length=80)


class OutcomeIn(BaseModel):
    observation: str = Field(min_length=3, max_length=600)
    recurrence_detected: bool
    days_to_recurrence: Optional[int] = Field(None, ge=0, le=3650)
    inspector_notes: Optional[str] = Field(None, max_length=600)


class Feedback(BaseModel):
    rating: Optional[Literal["helpful", "not_helpful"]]


async def _incident(incident_id: str) -> dict:
    incident = await get_database().incidents.find_one({"_id": incident_id})
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident["status"] != "completed":
        raise HTTPException(status_code=409, detail="This report is still being analysed.")
    return incident


async def _set_work_status(incident_id: str, note: str):
    db = get_database()
    status = await work_status_of(db, incident_id)
    incident = await store.update("incidents", incident_id, incident_id=incident_id, summary=note, set={"work_status": status})
    await broadcaster.broadcast("incident", {"incident": incident})


@router.patch("/detections/{detection_id}")
async def verify_detection(detection_id: str, body: Verification):
    """A person confirms or rejects what the models found. A rejected detection no longer counts towards the report."""
    db = get_database()
    detection = await db.detections.find_one({"_id": detection_id})
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    incident_id = detection["links"]["incident_id"]
    await _incident(incident_id)
    if detection.get("status") != body.status:
        words = {"open": "marked as unchecked", "confirmed": "confirmed by a person", "rejected": "rejected by a person"}
        await store.update("detections", detection_id, incident_id=incident_id,
                           summary=f"{detection['label']} {words[body.status]}",
                           set={"status": body.status, "verified_at": None if body.status == "open" else now()})
        await pipeline.reevaluate(incident_id, "Detection checked")
    return {"status": body.status}


@router.post("/incidents/{incident_id}/actions")
async def record_action(incident_id: str, body: ActionIn):
    """What the municipality did about a report. For a repeat report this is recorded on the case it was filed under."""
    incident = await _incident(incident_id)
    registration = incident.get("registration") or {}
    if registration.get("state") == "already_registered":
        incident_id = registration["case_id"]
        incident = await _incident(incident_id)
    recommendation = incident.get("recommendation") or {}
    action = await store.insert("actions", {
        "_id": pipeline.new_id("act"),
        "action_type": body.action_type.strip().lower().replace(" ", "_"),
        "assigned_department": body.assigned_department or next(iter(incident.get("departments") or []), None),
        "contractor": body.contractor,
        "notes": body.notes.strip(),
        "status": "completed",
        # Which advice was on the table when this was done, so its results can be compared later.
        "recommendation_followed": {"source": recommendation.get("source"), "memory_id": recommendation.get("memory_id")},
        "links": {"incident_id": incident_id, "outcome_ids": [], "memory_ids": []},
    }, summary=f"Action recorded: {body.notes.strip()[:80]}", incident_id=incident_id)
    await store.update("incidents", incident_id, incident_id=incident_id, summary="Linked to the action taken",
                       add={"links.action_ids": action["_id"]})
    await _set_work_status(incident_id, "Work started on this report")
    return action


@router.post("/actions/{action_id}/outcomes")
async def record_outcome(action_id: str, body: OutcomeIn):
    """What an inspector found after an action was carried out: did the fix hold, or did the problem come back?"""
    db = get_database()
    action = await db.actions.find_one({"_id": action_id})
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    incident_id = action["links"]["incident_id"]
    outcome = await store.insert("outcomes", {
        "_id": pipeline.new_id("out"),
        "observation": body.observation.strip(),
        "recurrence_detected": body.recurrence_detected,
        "days_to_recurrence": body.days_to_recurrence if body.recurrence_detected else None,
        "inspector_notes": body.inspector_notes,
        "links": {"action_id": action_id, "incident_id": incident_id, "memory_ids": []},
    }, summary=f"Outcome recorded: {'the problem came back' if body.recurrence_detected else 'the fix held'}", incident_id=incident_id)
    await store.update("actions", action_id, incident_id=incident_id, summary="Linked to its outcome",
                       add={"links.outcome_ids": outcome["_id"]})
    await _set_work_status(incident_id, "The problem came back after the repair" if body.recurrence_detected else "Resolved: the repair held")

    # Other reports of the same problem at this place now have something to learn from.
    incident = await db.incidents.find_one({"_id": incident_id}, {"links.related_incident_ids": 1})
    for other in (incident or {}).get("links", {}).get("related_incident_ids", []):
        await pipeline.reevaluate(other, "An outcome was recorded for another report here")
    return outcome


@router.post("/incidents/{incident_id}/feedback")
async def rate_recommendation(incident_id: str, body: Feedback):
    """Whether the recommendation was useful, as judged by the person handling the report."""
    await _incident(incident_id)
    feedback = {"rating": body.rating, "at": now()} if body.rating else None
    words = {"helpful": "helpful", "not_helpful": "not helpful", None: "unrated"}
    incident = await store.update("incidents", incident_id, incident_id=incident_id,
                                  summary=f"Recommendation rated {words[body.rating]}", set={"feedback": feedback})
    await broadcaster.broadcast("incident", {"incident": incident})
    return {"feedback": feedback}


@router.post("/incidents/{incident_id}/reevaluate")
async def reevaluate_incident(incident_id: str):
    """Works out this report's links and recommendation again from what the city knows now."""
    await _incident(incident_id)
    return await pipeline.reevaluate(incident_id, "Re-evaluated on request")
