"""
Links a new incident to what the city already knows:
  - memories: lessons learned from past repairs of the same kind of problem
  - related incidents: earlier reports of the same problem at the same place
and picks the recommendation that follows from them.
"""
import re
from typing import Any, Dict, List, Optional

from app import taxonomy
from app.core.database import get_database
from app.services.embedder import embedder

_STOPWORDS = {"the", "a", "an", "of", "near", "at", "on", "in", "and", "road", "street", "st", "rd", "no", "opp", "opposite"}


def location_key(location: Optional[str]) -> Optional[str]:
    """Normalised form of a location, so 'Sector 4, Main Rd.' and 'sector 4 main road' compare equal."""
    if not location:
        return None
    tokens = re.findall(r"[a-z0-9]+", location.lower())
    return " ".join(tokens) or None


def _same_place(a: Optional[str], b: Optional[str]) -> bool:
    if not a or not b:
        return False
    ta, tb = set(a.split()) - _STOPWORDS, set(b.split()) - _STOPWORDS
    if not ta or not tb:
        return a == b
    overlap = len(ta & tb)
    return overlap / min(len(ta), len(tb)) >= 0.6 and overlap / len(ta | tb) >= 0.3


async def find_duplicate(incident_id: str, sha256: Optional[str]) -> Optional[str]:
    """An earlier incident that submitted exactly the same file, if any."""
    if not sha256:
        return None
    db = get_database()
    m = await db.media_assets.find_one({"sha256": sha256, "links.incident_id": {"$ne": incident_id}}, sort=[("created_at", 1)])
    return m["links"]["incident_id"] if m else None


async def find_related_incidents(incident_id: str, issue_type_ids: List[str], loc_key: Optional[str]) -> List[str]:
    """Earlier incidents that report the same kind of issue at the same place."""
    if not loc_key or not issue_type_ids:
        return []
    db = get_database()
    related: List[str] = []
    cursor = db.incidents.find(
        {"_id": {"$ne": incident_id}, "status": "completed", "links.issue_type_ids": {"$in": issue_type_ids}, "location_key": {"$ne": None}},
        {"location_key": 1},
    ).sort("created_at", -1).limit(300)
    async for inc in cursor:
        if _same_place(loc_key, inc.get("location_key")):
            related.append(inc["_id"])
    return related[:10]


async def find_memories(issue_type_ids: List[str], incident_text: str, top_k: int = 2) -> List[Dict[str, Any]]:
    """Memories about the same kind of issue, most relevant to this incident first."""
    if not issue_type_ids:
        return []
    db = get_database()
    memories = await db.memories.find({"links.issue_type_id": {"$in": issue_type_ids}}).to_list(length=100)
    if not memories:
        return []
    texts = [f"{m['title']}. {m['lesson_learned']} {m.get('historical_action_taken', '')} Location: {m.get('location_tag', '')}" for m in memories]
    vectors = embedder.embed([incident_text] + texts)
    for m, score in zip(memories, vectors[1:] @ vectors[0]):
        m["relevance"] = round(float(score), 3)
    memories.sort(key=lambda m: m["relevance"], reverse=True)
    return memories[:top_k]


def learned_at(memory: Dict[str, Any], loc_key: Optional[str]) -> bool:
    """True when the lesson was learned at this very place."""
    return _same_place(loc_key, location_key(memory.get("location_tag")))


def recommend(primary_issue: Optional[str], memories: List[Dict[str, Any]], loc_key: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    A lesson learned at this very place beats the textbook procedure — that is the point
    of remembering. Lessons from elsewhere stay linked for reference but do not override it.
    """
    if not primary_issue:
        return None
    for m in memories:
        if m["links"]["issue_type_id"] == primary_issue and learned_at(m, loc_key):
            return {
                "text": m["recommended_protocol"],
                "source": "memory",
                "memory_id": m["_id"],
                "because": m.get("lesson_learned"),
            }
    return {
        "text": taxonomy.BY_ID[primary_issue].default_action,
        "source": "standard_procedure",
        "memory_id": None,
        "because": None,
    }
