"""
The only place documents are written from. Every insert, update and delete
goes through here, which is what makes each change visible in MongoDB:

  - the changed document gets a new `version` and `updated_at`
  - an entry describing the change is added to `activity_log`
  - the entry is pushed to the page, so it appears there as it happens
"""
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from pymongo import ReturnDocument

from app.core.database import get_database, new_log_id
from app.core.events import broadcaster

# Fields too large or too noisy to copy into a log entry.
_SKIP = {"updated_at", "version", "mask", "video", "storage_path", "sha256"}


def now() -> datetime:
    return datetime.now(timezone.utc)


def _brief(value: Any) -> Any:
    """A log-sized rendering of a value."""
    if isinstance(value, list):
        return value if len(value) <= 6 and all(not isinstance(v, (dict, list)) for v in value) else f"[{len(value)} items]"
    if isinstance(value, dict):
        return {k: _brief(v) for k, v in list(value.items())[:8]} if len(str(value)) < 400 else f"{{{len(value)} fields}}"
    if isinstance(value, str) and len(value) > 160:
        return value[:157] + "..."
    return value


async def log(action: str, collection: str, document_id: str, summary: str,
              changes: Optional[Dict[str, Any]] = None, incident_id: Optional[str] = None) -> Dict[str, Any]:
    at = now()
    entry = {
        "_id": new_log_id(at),
        "at": at,
        "action": action,
        "collection": collection,
        "document_id": document_id,
        "summary": summary,
        "changes": changes or {},
        "links": {"incident_id": incident_id},
    }
    await get_database().activity_log.insert_one(entry)
    await broadcaster.broadcast("update", entry)
    return entry


async def insert(collection: str, doc: Dict[str, Any], *, summary: str, incident_id: Optional[str] = None) -> Dict[str, Any]:
    at = now()
    doc.setdefault("version", 1)
    doc.setdefault("created_at", at)
    doc.setdefault("updated_at", at)
    await get_database()[collection].insert_one(doc)
    changes = {k: _brief(v) for k, v in doc.items() if k not in _SKIP | {"_id", "created_at", "links"}}
    await log("created", collection, doc["_id"], summary, changes, incident_id)
    return doc


async def update(
    collection: str, document_id: str, *, summary: str, incident_id: Optional[str] = None,
    set: Optional[Dict[str, Any]] = None, add: Optional[Dict[str, Any]] = None,
    pull: Optional[Dict[str, Any]] = None, inc: Optional[Dict[str, Any]] = None, record: bool = True,
) -> Optional[Dict[str, Any]]:
    """
    Updates one document and logs what changed.
    `set` assigns fields, `add` appends to array fields without duplicates, `inc` adds to counters.
    `record=False` skips the log entry (used only for progress ticks during video analysis).
    """
    ops: Dict[str, Any] = {"$set": {**(set or {}), "updated_at": now()}, "$inc": {**(inc or {}), "version": 1}}
    if add:
        ops["$addToSet"] = {k: ({"$each": v} if isinstance(v, list) else v) for k, v in add.items()}
    if pull:
        ops["$pull"] = pull

    coll = get_database()[collection]
    before = await coll.find_one_and_update({"_id": document_id}, ops, return_document=ReturnDocument.BEFORE)
    if before is None:
        return None
    if record:
        changes: Dict[str, Any] = {}
        for field, value in (set or {}).items():
            old = _dig(before, field)
            if field not in _SKIP and old != value:
                changes[field] = {"from": _brief(old), "to": _brief(value)}
        for field, value in (add or {}).items():
            changes[field] = {"added": _brief(value)}
        for field, value in (pull or {}).items():
            changes[field] = {"removed": _brief(value)}
        for field, value in (inc or {}).items():
            old = _dig(before, field) or 0
            changes[field] = {"from": old, "to": old + value}
        changes["version"] = {"from": before.get("version", 1), "to": before.get("version", 1) + 1}
        await log("updated", collection, document_id, summary, changes, incident_id)
    return await coll.find_one({"_id": document_id})


async def delete(collection: str, document_id: str, *, summary: str, incident_id: Optional[str] = None) -> bool:
    result = await get_database()[collection].delete_one({"_id": document_id})
    if result.deleted_count:
        await log("deleted", collection, document_id, summary, None, incident_id)
    return bool(result.deleted_count)


def _dig(doc: Dict[str, Any], dotted: str) -> Any:
    value: Any = doc
    for part in dotted.split("."):
        value = value.get(part) if isinstance(value, dict) else None
    return value
