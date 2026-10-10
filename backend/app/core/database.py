"""
MongoDB connection and schema for the `urbanhp` database.

How to read any document: the facts come first, and every reference to another
collection sits together under `links`. Every change is also written to
`activity_log`, so the history of a report can be followed step by step.

    incidents ──< detections >── issue_types ──< memories
        │              │                             │
        └── media_assets ──┘        actions ──< outcomes ──┘
        │
        └──< activity_log   (one entry per insert / update / delete)
"""
import logging
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import CollectionInvalid, OperationFailure

from app.core.config import settings
from app import taxonomy

logger = logging.getLogger("urbanhp.db")

ISSUE_IDS = list(taxonomy.BY_ID.keys())
STRINGS = {"bsonType": "array", "items": {"bsonType": "string"}}

# What each collection holds and how it connects to the others.
# Mirrored into the `about` collection (first in Compass's list) so the map is visible inside the database itself.
GUIDE = [
    {
        "_id": "incidents", "order": 1,
        "one_document_is": "One report submitted through the app: a photo, a video or a written complaint.",
        "read_first": ["title", "status", "severity", "location", "recommendation"],
        "links": {
            "links.media_id": "media_assets._id — the uploaded file",
            "links.detection_ids": "detections._id — everything found in this report",
            "links.issue_type_ids": "issue_types._id — the kinds of problem found, most severe first",
            "links.memory_ids": "memories._id — lessons from past repairs that apply",
            "links.related_incident_ids": "incidents._id — earlier reports of the same problem at the same place",
            "links.duplicate_of": "incidents._id — set when the very same file was submitted before",
            "links.action_ids": "actions._id — what was done about this incident",
        },
    },
    {
        "_id": "detections", "order": 2,
        "one_document_is": "One irregularity found in a report: an outlined object in a photo or video, or a problem named in the text.",
        "read_first": ["label", "severity", "confidence", "bbox", "mask"],
        "links": {
            "links.incident_id": "incidents._id — the report it was found in",
            "links.media_id": "media_assets._id — the file it was found in",
            "links.issue_type_id": "issue_types._id — what kind of problem it is",
            "links.memory_ids": "memories._id — lessons that apply to this kind of problem",
        },
    },
    {
        "_id": "media_assets", "order": 3,
        "one_document_is": "One uploaded image or video file.",
        "read_first": ["file_name", "kind", "url"],
        "links": {
            "links.incident_id": "incidents._id — the report this file belongs to",
            "links.detection_ids": "detections._id — everything found in this file",
        },
    },
    {
        "_id": "issue_types", "order": 4,
        "one_document_is": "The meaning of one kind of problem: what it is, which department handles it, the standard fix.",
        "read_first": ["label", "department", "default_action", "stats"],
        "links": {
            "links.memory_ids": "memories._id — lessons learned about this kind of problem",
            "links.last_incident_id": "incidents._id — the most recent report with this problem",
        },
    },
    {
        "_id": "memories", "order": 5,
        "one_document_is": "A lesson the city learned from a past repair, reused when the same problem returns.",
        "read_first": ["title", "lesson_learned", "recommended_protocol", "times_used"],
        "links": {
            "links.issue_type_id": "issue_types._id — the kind of problem the lesson is about",
            "links.learned_from_incident_ids": "incidents._id — the reports the lesson came from",
            "links.action_ids": "actions._id — what was tried",
            "links.outcome_ids": "outcomes._id — how that turned out",
            "links.used_by_incident_ids": "incidents._id — later reports this lesson was attached to",
        },
    },
    {
        "_id": "actions", "order": 6,
        "one_document_is": "Something the municipality did about an incident.",
        "read_first": ["action_type", "assigned_department", "notes"],
        "links": {
            "links.incident_id": "incidents._id — the incident it responded to",
            "links.outcome_ids": "outcomes._id — what happened afterwards",
            "links.memory_ids": "memories._id — the lessons drawn from it",
        },
    },
    {
        "_id": "outcomes", "order": 7,
        "one_document_is": "What an inspector found after an action was carried out.",
        "read_first": ["observation", "recurrence_detected", "days_to_recurrence"],
        "links": {
            "links.action_id": "actions._id — the action that was inspected",
            "links.incident_id": "incidents._id — the incident it belongs to",
            "links.memory_ids": "memories._id — the lessons drawn from it",
        },
    },
    {
        "_id": "activity_log", "order": 8,
        "one_document_is": "One change made to the database: a document created, updated or deleted. Sort by { at: -1 } to see the latest first.",
        "read_first": ["at", "summary", "collection", "document_id", "changes"],
        "links": {
            "document_id": "the _id of the changed document, in the collection named by `collection`",
            "links.incident_id": "incidents._id — the report that caused the change",
        },
    },
    {
        "_id": "incident_overview", "order": 9,
        "one_document_is": "A read-only view: each incident joined with its file, detections, issue types, memories, related incidents and full update history.",
        "read_first": ["title", "detections", "updates"],
        "links": {},
    },
]

LINKS = {
    "incidents": {
        "bsonType": "object",
        "required": ["media_id", "detection_ids", "issue_type_ids", "memory_ids", "related_incident_ids", "duplicate_of", "action_ids"],
        "properties": {
            "media_id": {"bsonType": ["string", "null"], "description": "-> media_assets._id"},
            "detection_ids": {**STRINGS, "description": "-> detections._id"},
            "issue_type_ids": {"bsonType": "array", "items": {"enum": ISSUE_IDS}, "description": "-> issue_types._id (most severe first)"},
            "memory_ids": {**STRINGS, "description": "-> memories._id"},
            "related_incident_ids": {**STRINGS, "description": "-> incidents._id (same problem, same place)"},
            "duplicate_of": {"bsonType": ["string", "null"], "description": "-> incidents._id (same file submitted before)"},
            "action_ids": {**STRINGS, "description": "-> actions._id"},
        },
    },
    "detections": {
        "bsonType": "object",
        "required": ["incident_id", "media_id", "issue_type_id", "memory_ids"],
        "properties": {
            "incident_id": {"bsonType": "string", "description": "-> incidents._id"},
            "media_id": {"bsonType": ["string", "null"], "description": "-> media_assets._id"},
            "issue_type_id": {"enum": ISSUE_IDS, "description": "-> issue_types._id"},
            "memory_ids": {**STRINGS, "description": "-> memories._id"},
        },
    },
    "media_assets": {
        "bsonType": "object",
        "required": ["incident_id", "detection_ids"],
        "properties": {
            "incident_id": {"bsonType": "string", "description": "-> incidents._id"},
            "detection_ids": {**STRINGS, "description": "-> detections._id"},
        },
    },
}

# JSON-schema validators: MongoDB itself rejects malformed or unlinked documents.
VALIDATORS = {
    "incidents": {
        "bsonType": "object",
        "required": ["_id", "input_type", "status", "version", "links", "created_at", "updated_at"],
        "properties": {
            "_id": {"bsonType": "string"},
            "input_type": {"enum": ["image", "video", "text"]},
            "status": {"enum": ["received", "analyzing", "completed", "failed"]},
            "version": {"bsonType": "int", "minimum": 1, "description": "Goes up by one on every update"},
            "title": {"bsonType": ["string", "null"], "description": "One-line summary of what was found"},
            "location": {"bsonType": ["string", "null"]},
            "location_key": {"bsonType": ["string", "null"], "description": "Normalised location, used to match the same place"},
            "severity": {"bsonType": ["int", "null"], "minimum": 1, "maximum": 5},
            "links": LINKS["incidents"],
            "created_at": {"bsonType": "date"},
            "updated_at": {"bsonType": "date"},
        },
    },
    "detections": {
        "bsonType": "object",
        "required": ["_id", "label", "severity", "confidence", "source", "links", "created_at"],
        "properties": {
            "_id": {"bsonType": "string"},
            "label": {"bsonType": "string"},
            "severity": {"bsonType": "int", "minimum": 1, "maximum": 5},
            "confidence": {"bsonType": "double", "minimum": 0, "maximum": 1},
            "source": {"enum": ["image", "video", "text"]},
            "bbox": {
                "bsonType": ["object", "null"], "required": ["x", "y", "w", "h"],
                "description": "Box as fractions (0-1) of the frame; x, y = top-left corner",
            },
            "mask": {"bsonType": ["array", "null"], "description": "Outline of the object: [x, y] points as fractions (0-1) of the frame"},
            "links": LINKS["detections"],
            "created_at": {"bsonType": "date"},
        },
    },
    "media_assets": {
        "bsonType": "object",
        "required": ["_id", "kind", "file_name", "url", "sha256", "links", "created_at"],
        "properties": {
            "_id": {"bsonType": "string"},
            "kind": {"enum": ["image", "video"]},
            "file_name": {"bsonType": "string"},
            "url": {"bsonType": "string"},
            "sha256": {"bsonType": "string"},
            "links": LINKS["media_assets"],
            "created_at": {"bsonType": "date"},
        },
    },
    "issue_types": {
        "bsonType": "object",
        "required": ["_id", "label", "department", "description", "default_action", "links"],
        "properties": {
            "_id": {"bsonType": "string", "description": "Issue type id, e.g. 'pothole'"},
            "department": {"bsonType": "string", "description": "Municipal department responsible"},
            "links": {"bsonType": "object", "required": ["memory_ids"]},
        },
    },
    "memories": {
        "bsonType": "object",
        "required": ["_id", "title", "lesson_learned", "recommended_protocol", "links"],
        "properties": {
            "_id": {"bsonType": "string"},
            "links": {"bsonType": "object", "required": ["issue_type_id", "learned_from_incident_ids", "used_by_incident_ids"]},
        },
    },
    "actions": {
        "bsonType": "object",
        "required": ["_id", "action_type", "links"],
        "properties": {"links": {"bsonType": "object", "required": ["incident_id", "outcome_ids", "memory_ids"]}},
    },
    "outcomes": {
        "bsonType": "object",
        "required": ["_id", "observation", "links"],
        "properties": {"links": {"bsonType": "object", "required": ["action_id", "incident_id", "memory_ids"]}},
    },
    "activity_log": {
        "bsonType": "object",
        "required": ["_id", "at", "action", "collection", "document_id", "summary", "links"],
        "properties": {
            "at": {"bsonType": "date"},
            "action": {"enum": ["created", "updated", "deleted"]},
            "collection": {"bsonType": "string"},
            "document_id": {"bsonType": "string"},
            "summary": {"bsonType": "string", "description": "What changed, in plain words"},
            "links": {"bsonType": "object", "required": ["incident_id"]},
        },
    },
}

COLLECTIONS = ["incidents", "detections", "media_assets", "issue_types", "memories", "actions", "outcomes", "activity_log"]

INDEXES = {
    "incidents": [
        [("created_at", -1)],
        [("links.issue_type_ids", 1), ("created_at", -1)],
        [("status", 1)],
        [("location_key", 1)],
    ],
    "detections": [
        [("links.incident_id", 1)],
        [("links.issue_type_id", 1), ("severity", -1)],
        [("links.media_id", 1)],
    ],
    "media_assets": [[("links.incident_id", 1)], [("sha256", 1)]],
    "memories": [[("links.issue_type_id", 1)]],
    "actions": [[("links.incident_id", 1)]],
    "outcomes": [[("links.action_id", 1)], [("links.incident_id", 1)]],
    "activity_log": [[("at", -1)], [("links.incident_id", 1), ("at", 1)], [("collection", 1), ("document_id", 1)]],
}

# Indexes from the previous layout, removed during migration.
LEGACY_INDEXES = {
    "incidents": ["issue_types_1_created_at_-1"],
    "detections": ["incident_id_1", "issue_type_1_severity_-1", "media_id_1"],
    "media_assets": ["incident_id_1"],
    "memories": ["issue_type_1"],
    "actions": ["incident_id_1"],
    "outcomes": ["action_id_1", "incident_id_1"],
}

# A read-only view that joins everything about an incident into one document.
OVERVIEW_VIEW = "incident_overview"
OVERVIEW_PIPELINE = [
    {"$lookup": {"from": "media_assets", "localField": "links.media_id", "foreignField": "_id", "as": "media"}},
    {"$lookup": {"from": "detections", "localField": "_id", "foreignField": "links.incident_id", "as": "detections"}},
    {"$lookup": {"from": "issue_types", "localField": "links.issue_type_ids", "foreignField": "_id", "as": "issue_types"}},
    {"$lookup": {"from": "memories", "localField": "links.memory_ids", "foreignField": "_id", "as": "memories"}},
    {"$lookup": {"from": "incidents", "localField": "links.related_incident_ids", "foreignField": "_id", "as": "related_incidents"}},
    {"$lookup": {"from": "actions", "localField": "_id", "foreignField": "links.incident_id", "as": "actions"}},
    {"$lookup": {
        "from": "activity_log", "localField": "_id", "foreignField": "links.incident_id", "as": "updates",
        "pipeline": [{"$sort": {"at": 1}}, {"$project": {"_id": 0, "at": 1, "summary": 1, "collection": 1, "document_id": 1}}],
    }},
    {"$set": {"media": {"$first": "$media"}}},
    {"$project": {
        "location_key": 0,
        "detections.video.path": 0, "detections.mask": 0,
        "issue_types.detector_prompts": 0, "issue_types.text_keywords": 0,
        "related_incidents.links": 0, "related_incidents.analysis": 0, "related_incidents.recommendation": 0,
    }},
    {"$sort": {"created_at": -1}},
]


class Database:
    client: AsyncIOMotorClient | None = None
    db: AsyncIOMotorDatabase | None = None


db_instance = Database()


async def connect_to_mongo():
    logger.info("Connecting to MongoDB at %s (database: %s)", settings.MONGODB_URL, settings.DATABASE_NAME)
    db_instance.client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=4000, tz_aware=True)
    db_instance.db = db_instance.client[settings.DATABASE_NAME]
    await db_instance.db.command("ping")
    await init_schema()
    logger.info("MongoDB ready. Open Compass at %s and pick the '%s' database.", settings.MONGODB_URL, settings.DATABASE_NAME)


async def close_mongo_connection():
    if db_instance.client:
        db_instance.client.close()


def get_database() -> AsyncIOMotorDatabase:
    if db_instance.db is None:
        raise RuntimeError("Database is not initialized. Call connect_to_mongo() first.")
    return db_instance.db


async def init_schema():
    """Creates collections, the guide, validators, indexes and the overview view. Safe to re-run."""
    db = get_database()
    existing = set(await db.list_collection_names())

    for name in COLLECTIONS:
        if name not in existing:
            try:
                await db.create_collection(name)
                logger.info("Created collection %s.%s", settings.DATABASE_NAME, name)
            except CollectionInvalid:
                pass

    migrated = await _migrate_legacy_layout(db)

    for name in COLLECTIONS:
        await db.command("collMod", name, validator={"$jsonSchema": VALIDATORS[name]}, validationLevel="strict")
    for name, specs in INDEXES.items():
        for keys in specs:
            await db[name].create_index(keys)

    for doc in GUIDE:
        await db.about.replace_one({"_id": doc["_id"]}, doc, upsert=True)
    if "_guide" in existing:  # earlier name; awkward to query from the mongo shell
        await db.drop_collection("_guide")

    await _sync_issue_types(db)

    try:
        if OVERVIEW_VIEW in existing:
            await db.command("collMod", OVERVIEW_VIEW, viewOn="incidents", pipeline=OVERVIEW_PIPELINE)
        else:
            await db.create_collection(OVERVIEW_VIEW, viewOn="incidents", pipeline=OVERVIEW_PIPELINE)
    except (CollectionInvalid, OperationFailure) as e:
        logger.warning("Could not create the %s view: %s", OVERVIEW_VIEW, e)

    if migrated:
        await rebuild_links()


async def _sync_issue_types(db):
    """Keeps the issue taxonomy in the database in step with the code, without touching its links or counters."""
    now = datetime.now(timezone.utc)
    for doc in taxonomy.as_documents():
        _id = doc.pop("_id")
        await db.issue_types.update_one(
            {"_id": _id},
            {"$set": doc, "$setOnInsert": {
                "stats": {"incidents": 0, "detections": 0, "last_detected_at": None},
                "links": {"memory_ids": [], "last_incident_id": None},
                "version": 1, "created_at": now, "updated_at": now,
            }},
            upsert=True,
        )


# --------------------------------------------------------------------------- #
# Upgrading a database created by the first version of this app
# --------------------------------------------------------------------------- #

async def _migrate_legacy_layout(db) -> bool:
    """Moves references under `links`, drops stored embeddings and turns old timelines into log entries."""
    changed = False
    now = datetime.now(timezone.utc)
    for name in COLLECTIONS:
        await db.command("collMod", name, validator={}, validationLevel="off")

    async for d in db.incidents.find({"links": {"$exists": False}}):
        changed = True
        for step in d.get("timeline") or []:
            await db.activity_log.insert_one({
                "_id": new_log_id(step.get("at") or now), "at": step.get("at") or now, "action": "updated",
                "collection": "incidents", "document_id": d["_id"], "summary": step.get("detail") or step.get("stage", ""),
                "changes": {"status": step.get("stage")}, "links": {"incident_id": d["_id"]},
            })
        new = {k: v for k, v in d.items() if k not in {
            "media_id", "detection_ids", "issue_types", "primary_issue", "memory_ids", "related_incident_ids",
            "duplicate_of", "embedding", "timeline",
        }}
        new["version"] = max(1, len(d.get("timeline") or []))
        new["links"] = {
            "media_id": d.get("media_id"),
            "detection_ids": d.get("detection_ids") or [],
            "issue_type_ids": d.get("issue_types") or [],
            "memory_ids": d.get("memory_ids") or [],
            "related_incident_ids": d.get("related_incident_ids") or [],
            "duplicate_of": d.get("duplicate_of"),
            "action_ids": [],
        }
        new.setdefault("updated_at", d.get("created_at") or now)
        await db.incidents.replace_one({"_id": d["_id"]}, new)

    async for d in db.detections.find({"links": {"$exists": False}}):
        changed = True
        new = {k: v for k, v in d.items() if k not in {
            "incident_id", "media_id", "issue_type", "track", "path", "evidence_text", "matched_keyword", "matched_phrase", "model_scores",
        }}
        new["mask"] = None
        if d.get("track"):
            new["video"] = {**d["track"], "path": d.get("path") or []}
        if d.get("source") == "text":
            new["text"] = {"evidence": d.get("evidence_text"), "matched_keyword": d.get("matched_keyword")}
        new["model"] = {"name": "text-analyzer" if d.get("source") == "text" else "zero-shot", "scores": d.get("model_scores") or {}}
        new["links"] = {"incident_id": d["incident_id"], "media_id": d.get("media_id"), "issue_type_id": d["issue_type"], "memory_ids": []}
        new["version"] = 1
        new.setdefault("updated_at", d.get("created_at") or now)
        await db.detections.replace_one({"_id": d["_id"]}, new)

    async for d in db.media_assets.find({"links": {"$exists": False}}):
        changed = True
        new = {k: v for k, v in d.items() if k != "incident_id"}
        new["links"] = {"incident_id": d["incident_id"], "detection_ids": []}
        new["version"] = 1
        new.setdefault("updated_at", d.get("created_at") or now)
        await db.media_assets.replace_one({"_id": d["_id"]}, new)

    async for d in db.memories.find({"links": {"$exists": False}}):
        changed = True
        new = {k: v for k, v in d.items() if k not in {"issue_type", "incident_type", "source_incident_ids", "embedding"}}
        new["times_used"] = 0
        new["links"] = {
            "issue_type_id": d.get("issue_type") or d.get("incident_type"),
            "learned_from_incident_ids": d.get("source_incident_ids") or [],
            "action_ids": [], "outcome_ids": [], "used_by_incident_ids": [],
        }
        new["version"] = 1
        new.setdefault("updated_at", d.get("created_at") or now)
        await db.memories.replace_one({"_id": d["_id"]}, new)

    async for d in db.actions.find({"links": {"$exists": False}}):
        changed = True
        new = {k: v for k, v in d.items() if k != "incident_id"}
        new["links"] = {"incident_id": d.get("incident_id"), "outcome_ids": [], "memory_ids": []}
        await db.actions.replace_one({"_id": d["_id"]}, new)

    async for d in db.outcomes.find({"links": {"$exists": False}}):
        changed = True
        new = {k: v for k, v in d.items() if k not in {"action_id", "incident_id"}}
        new["links"] = {"action_id": d.get("action_id"), "incident_id": d.get("incident_id"), "memory_ids": []}
        await db.outcomes.replace_one({"_id": d["_id"]}, new)

    async for d in db.issue_types.find({"links": {"$exists": False}}):
        changed = True
        await db.issue_types.update_one({"_id": d["_id"]}, {"$set": {
            "stats": {"incidents": 0, "detections": 0, "last_detected_at": None},
            "links": {"memory_ids": [], "last_incident_id": None}, "version": 1,
        }})

    if changed:
        for name, index_names in LEGACY_INDEXES.items():
            current = await db[name].index_information()
            for index_name in index_names:
                if index_name in current:
                    await db[name].drop_index(index_name)
        logger.info("Upgraded existing documents to the linked layout.")
    return changed


async def rebuild_links():
    """
    Recomputes every reverse link and counter from the primary references, so all
    collections point at each other consistently (run after a migration or a seed).
    """
    db = get_database()

    detections_by_incident, detections_by_media, types_by_incident = {}, {}, {}
    async for d in db.detections.find({}, {"links": 1, "severity": 1}).sort([("severity", -1), ("confidence", -1)]):
        links = d["links"]
        detections_by_incident.setdefault(links["incident_id"], []).append(d["_id"])
        if links.get("media_id"):
            detections_by_media.setdefault(links["media_id"], []).append(d["_id"])
        kinds = types_by_incident.setdefault(links["incident_id"], [])
        if links["issue_type_id"] not in kinds:
            kinds.append(links["issue_type_id"])

    actions_by_incident, outcomes_by_action = {}, {}
    async for a in db.actions.find({}, {"links": 1}):
        actions_by_incident.setdefault(a["links"].get("incident_id"), []).append(a["_id"])
    async for o in db.outcomes.find({}, {"links": 1}):
        outcomes_by_action.setdefault(o["links"].get("action_id"), []).append(o["_id"])

    memories = await db.memories.find({}, {"links": 1}).to_list(length=1000)
    used_by = {m["_id"]: [] for m in memories}
    memories_of_incident = {}
    async for i in db.incidents.find({}, {"links": 1}).sort("created_at", 1):
        memories_of_incident[i["_id"]] = i["links"].get("memory_ids", [])
        update = {"links.action_ids": actions_by_incident.get(i["_id"], [])}
        if i["_id"] in detections_by_incident:
            update["links.detection_ids"] = detections_by_incident[i["_id"]]
            update["links.issue_type_ids"] = types_by_incident[i["_id"]]
        await db.incidents.update_one({"_id": i["_id"]}, {"$set": update})
        for memory_id in i["links"].get("memory_ids", []):
            learned_from = next((m["links"]["learned_from_incident_ids"] for m in memories if m["_id"] == memory_id), [])
            if memory_id in used_by and i["_id"] not in learned_from:
                used_by[memory_id].append(i["_id"])

    async for m in db.media_assets.find({}, {"_id": 1}):
        await db.media_assets.update_one({"_id": m["_id"]}, {"$set": {"links.detection_ids": detections_by_media.get(m["_id"], [])}})

    memories_by_type, memories_by_action, memories_by_outcome = {}, {}, {}
    for m in memories:
        sources = m["links"].get("learned_from_incident_ids", [])
        action_ids = [a for s in sources for a in actions_by_incident.get(s, [])]
        outcome_ids = [o for a in action_ids for o in outcomes_by_action.get(a, [])]
        for a in action_ids:
            memories_by_action.setdefault(a, []).append(m["_id"])
        for o in outcome_ids:
            memories_by_outcome.setdefault(o, []).append(m["_id"])
        memories_by_type.setdefault(m["links"].get("issue_type_id"), []).append(m["_id"])
        await db.memories.update_one({"_id": m["_id"]}, {"$set": {
            "links.action_ids": action_ids, "links.outcome_ids": outcome_ids,
            "links.used_by_incident_ids": used_by[m["_id"]], "times_used": len(used_by[m["_id"]]),
        }})

    async for a in db.actions.find({}, {"_id": 1}):
        await db.actions.update_one({"_id": a["_id"]}, {"$set": {
            "links.outcome_ids": outcomes_by_action.get(a["_id"], []), "links.memory_ids": memories_by_action.get(a["_id"], []),
        }})
    async for o in db.outcomes.find({}, {"_id": 1}):
        await db.outcomes.update_one({"_id": o["_id"]}, {"$set": {"links.memory_ids": memories_by_outcome.get(o["_id"], [])}})

    async for d in db.detections.find({}, {"links": 1}):
        await db.detections.update_one({"_id": d["_id"]}, {"$set": {"links.memory_ids": [
            m for m in memories_by_type.get(d["links"]["issue_type_id"], [])
            if m in memories_of_incident.get(d["links"]["incident_id"], [])
        ]}})

    async for t in db.issue_types.find({}, {"_id": 1}):
        last = await db.incidents.find_one({"links.issue_type_ids": t["_id"]}, {"created_at": 1}, sort=[("created_at", -1)])
        await db.issue_types.update_one({"_id": t["_id"]}, {"$set": {
            "stats.incidents": await db.incidents.count_documents({"links.issue_type_ids": t["_id"]}),
            "stats.detections": await db.detections.count_documents({"links.issue_type_id": t["_id"]}),
            "stats.last_detected_at": last["created_at"] if last else None,
            "links.memory_ids": memories_by_type.get(t["_id"], []),
            "links.last_incident_id": last["_id"] if last else None,
        }})


def new_log_id(at: datetime) -> str:
    """Log ids start with the time, so sorting by _id is also sorting by when it happened."""
    return f"log_{at.strftime('%Y%m%d_%H%M%S_%f')[:22]}_{uuid.uuid4().hex[:4]}"
