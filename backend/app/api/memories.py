"""
The city's memory and the lab that tests it:

  /memories   the lessons themselves — write one from a report, edit it, validate or retire it
  /lab        re-evaluate reports against the current lessons and measure what memory changes
"""
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import taxonomy
from app.core import store
from app.core.database import get_database
from app.services import pipeline

router = APIRouter(tags=["memory"])

Status = Literal["draft", "validated", "retired"]
Risk = Literal["low", "medium", "high", "critical"]


class MemoryIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    lesson_learned: str = Field(min_length=3, max_length=800)
    recommended_protocol: str = Field(min_length=3, max_length=800)
    # The report the lesson is drawn from; its place, issue type, actions and outcomes are linked automatically.
    incident_id: Optional[str] = None
    issue_type_id: Optional[str] = None
    location_tag: Optional[str] = Field(None, max_length=160)
    recurrence_risk: Risk = "medium"
    status: Status = "draft"


class MemoryEdit(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=120)
    lesson_learned: Optional[str] = Field(None, min_length=3, max_length=800)
    recommended_protocol: Optional[str] = Field(None, min_length=3, max_length=800)
    location_tag: Optional[str] = Field(None, max_length=160)
    recurrence_risk: Optional[Risk] = None
    status: Optional[Status] = None


async def _memory(memory_id: str) -> Dict[str, Any]:
    memory = await get_database().memories.find_one({"_id": memory_id})
    if not memory:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return memory


@router.get("/memories")
async def list_memories():
    """Every lesson, the most used first."""
    db = get_database()
    memories = await db.memories.find().sort([("times_used", -1), ("created_at", -1)]).to_list(length=500)
    for m in memories:
        m["issue_label"] = taxonomy.BY_ID[m["links"]["issue_type_id"]].label if m["links"].get("issue_type_id") in taxonomy.BY_ID else None
        # Attached as evidence (times_used) is not the same as deciding the advice.
        m["decided"] = await db.incidents.count_documents({"recommendation.memory_id": m["_id"], "is_seed": {"$ne": True}})
    return memories


@router.post("/memories")
async def create_memory(body: MemoryIn):
    """Writes down a lesson. One drawn from a report inherits that report's place and what was tried there."""
    db = get_database()
    incident = actions = outcomes = None
    if body.incident_id:
        incident = await db.incidents.find_one({"_id": body.incident_id})
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        actions = await db.actions.find({"links.incident_id": body.incident_id}).sort("created_at", 1).to_list(length=50)
        outcomes = await db.outcomes.find({"links.incident_id": body.incident_id}).sort("created_at", 1).to_list(length=50)

    issue_type_id = body.issue_type_id or next(iter((incident or {}).get("links", {}).get("issue_type_ids", [])), None)
    if issue_type_id not in taxonomy.BY_ID:
        raise HTTPException(status_code=400, detail="Say what kind of problem this lesson is about.")

    memory = await store.insert("memories", {
        "_id": pipeline.new_id("mem"),
        "title": body.title.strip(),
        "status": body.status,
        "location_tag": (body.location_tag or (incident or {}).get("location") or "").strip() or None,
        "geo": (incident or {}).get("geo"),
        "lesson_learned": body.lesson_learned.strip(),
        "historical_action_taken": actions[-1]["notes"] if actions else None,
        "recorded_outcome": outcomes[-1]["observation"] if outcomes else None,
        "recurrence_risk": body.recurrence_risk,
        "recommended_protocol": body.recommended_protocol.strip(),
        "times_used": 0,
        "links": {
            "issue_type_id": issue_type_id,
            "learned_from_incident_ids": [body.incident_id] if incident else [],
            "action_ids": [a["_id"] for a in actions or []],
            "outcome_ids": [o["_id"] for o in outcomes or []],
            "used_by_incident_ids": [],
        },
    }, summary=f"Lesson written: {body.title.strip()}", incident_id=body.incident_id)

    # Everything the lesson was drawn from points back at it.
    note = f"Linked to lesson '{memory['title']}'"
    await store.update("issue_types", issue_type_id, incident_id=body.incident_id, summary=note, add={"links.memory_ids": memory["_id"]})
    for a in actions or []:
        await store.update("actions", a["_id"], incident_id=body.incident_id, summary=note, add={"links.memory_ids": memory["_id"]})
    for o in outcomes or []:
        await store.update("outcomes", o["_id"], incident_id=body.incident_id, summary=note, add={"links.memory_ids": memory["_id"]})
    return memory


@router.patch("/memories/{memory_id}")
async def edit_memory(memory_id: str, body: MemoryEdit):
    """Edits a lesson, or validates / retires it. Reports keep their current advice until they are re-evaluated."""
    memory = await _memory(memory_id)
    changes = {k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    changes = {k: v for k, v in changes.items() if memory.get(k) != v}
    if not changes:
        return memory
    if "status" in changes:
        note = {"validated": "validated: it now shapes recommendations", "retired": "retired: it no longer shapes recommendations",
                "draft": "moved back to draft"}[changes["status"]]
        summary = f"Lesson '{memory['title']}' {note}"
    else:
        summary = f"Lesson '{memory['title']}' edited"
    return await store.update("memories", memory_id, summary=summary, set=changes)


@router.delete("/memories/{memory_id}")
async def delete_memory(memory_id: str):
    """Deletes a lesson, unlinks it everywhere and re-evaluates the reports that relied on it."""
    db = get_database()
    memory = await _memory(memory_id)
    note = f"Unlinked from deleted lesson '{memory['title']}'"
    for collection in ("issue_types", "actions", "outcomes", "detections"):
        async for doc in db[collection].find({"links.memory_ids": memory_id}, {"_id": 1}):
            await store.update(collection, doc["_id"], summary=note, pull={"links.memory_ids": memory_id})
    used_by = [i["_id"] async for i in db.incidents.find({"links.memory_ids": memory_id}, {"_id": 1})]
    await store.delete("memories", memory_id, summary=f"Lesson deleted: {memory['title']}")
    for incident_id in used_by:
        # The lesson is gone: clear the link first, so re-evaluation does not try to update it.
        await store.update("incidents", incident_id, incident_id=incident_id, summary=note, pull={"links.memory_ids": memory_id})
        await pipeline.reevaluate(incident_id, "A lesson it relied on was deleted")
    return {"status": "deleted", "memory_id": memory_id, "reevaluated": len(used_by)}


# --------------------------------------------------------------------------- #
# Memory Impact Lab
# --------------------------------------------------------------------------- #

def _group(source: Optional[str]) -> str:
    return "standard" if source in (None, "standard_procedure") else "memory"


@router.post("/lab/reevaluate")
async def reevaluate_all():
    """Re-evaluates every analysed report against the current lessons and says which recommendations changed."""
    db = get_database()
    ids = [i["_id"] async for i in db.incidents.find({"status": "completed", "is_seed": {"$ne": True}}, {"_id": 1}).sort("created_at", 1)]
    results = [r for r in [await pipeline.reevaluate(i, "Re-evaluated in the Memory Lab") for i in ids] if r]
    return {"evaluated": len(results), "changed": [r for r in results if r["changed"]]}


@router.get("/lab/impact")
async def impact():
    """
    What memory changes. Reports are split by whether their recommendation was shaped by memory
    (a lesson, or what was tried at that place before) or is the standard procedure, and each
    group is measured the same way: how people rated the advice, and whether the repair held.
    """
    db = get_database()
    cases = {"status": "completed", "is_seed": {"$ne": True}, "registration.state": {"$ne": "already_registered"}}
    incidents = await db.incidents.find(
        {**cases, "recommendation": {"$ne": None}},
        {"title": 1, "location": 1, "created_at": 1, "severity": 1, "recommendation": 1, "feedback": 1, "work_status": 1, "is_recurring": 1},
    ).sort("created_at", -1).to_list(length=1000)

    groups = {g: {"reports": 0, "helpful": 0, "not_helpful": 0, "resolved": 0, "recurred": 0} for g in ("memory", "standard")}
    rows: List[Dict[str, Any]] = []
    for i in incidents:
        rec = i["recommendation"]
        g = groups[_group(rec.get("source"))]
        g["reports"] += 1
        rating = (i.get("feedback") or {}).get("rating")
        if rating:
            g[rating] += 1
        if i.get("work_status") in ("resolved", "recurred"):
            g[i["work_status"]] += 1
        rows.append({
            "_id": i["_id"], "title": i.get("title"), "location": i.get("location"), "created_at": i["created_at"],
            "severity": i.get("severity"), "source": rec.get("source"), "text": rec.get("text"),
            "baseline": rec.get("baseline"), "because": rec.get("because"),
            "avoid": len(rec.get("avoid") or []), "evidence": len(rec.get("evidence") or []),
            "rating": rating, "work_status": i.get("work_status", "open"), "is_recurring": i.get("is_recurring", False),
        })

    by_status = {s: await db.memories.count_documents({"status": s}) for s in ("validated", "draft", "retired")}
    return {
        # Every report submitted; `reports` below counts those that were given a recommendation.
        "total_reports": await db.incidents.count_documents({"is_seed": {"$ne": True}}),
        "reports": len(incidents),
        "groups": groups,
        "memories": {**by_status, "in_use": await db.memories.count_documents({"times_used": {"$gt": 0}})},
        "open_reports": await db.incidents.count_documents({**cases, "work_status": {"$in": ["open", "in_progress"]}}),
        "recurring_reports": await db.incidents.count_documents({**cases, "is_recurring": True}),
        "rows": rows,
    }
