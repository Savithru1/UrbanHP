"""
Links a report to what the city already knows:

  - registration: is this a new problem, another report of one that is already open, or one that has come back?
  - history: earlier reports at the same place, what was tried about them and how it turned out,
    and instructive cases of the same kind of problem elsewhere
  - memories: validated lessons learned from past repairs
  - search: finding past reports by what they say, where they are, or what they mean

and builds the recommendation that follows from all of it.
"""
import math
import re
from typing import Any, Dict, List, Optional

from app import taxonomy
from app.core.database import get_database
from app.services.embedder import embedder

_STOPWORDS = {"the", "a", "an", "of", "near", "at", "on", "in", "and", "road", "street", "st", "rd", "no", "opp", "opposite"}

# Two pinned locations closer than this are treated as the same place.
SAME_PLACE_M = 100.0
# How alike a report and a lesson from another place must be before the lesson is offered as a hint.
# (Measured on this project's data: an unrelated lesson of the same issue type scores 0.25-0.35,
# one that describes the same cause scores 0.55 and up.)
LESSON_HINT_MIN = 0.45
# How alike two descriptions must be to count as the same sort of case. Two reports of the same
# issue type score 0.5-0.6 on the shared word alone ("pothole"); 0.7 and up means the detail matches too.
CASE_HINT_MIN = 0.7
# A case that is still being dealt with.
ACTIVE = ("open", "in_progress")

_INCIDENT_FIELDS = {
    "title": 1, "location": 1, "location_key": 1, "geo": 1, "created_at": 1, "citizen_text": 1,
    "work_status": 1, "registration": 1, "links.issue_type_ids": 1,
}


def location_key(location: Optional[str]) -> Optional[str]:
    """Normalised form of a location, so 'Sector 4, Main Rd.' and 'sector 4 main road' compare equal."""
    if not location:
        return None
    tokens = re.findall(r"[a-z0-9]+", location.lower())
    return " ".join(tokens) or None


def point(latitude: float, longitude: float) -> Dict[str, Any]:
    """A position as MongoDB stores it: a GeoJSON Point, longitude first."""
    return {"type": "Point", "coordinates": [round(float(longitude), 6), round(float(latitude), 6)]}


def distance_m(a: Optional[Dict[str, Any]], b: Optional[Dict[str, Any]]) -> Optional[float]:
    """Metres between two GeoJSON points (great-circle distance), or None when either is unknown."""
    if not a or not b:
        return None
    (lng1, lat1), (lng2, lat2) = a["coordinates"], b["coordinates"]
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


def _same_text(a: Optional[str], b: Optional[str]) -> bool:
    if not a or not b:
        return False
    ta, tb = set(a.split()) - _STOPWORDS, set(b.split()) - _STOPWORDS
    if not ta or not tb:
        return a == b
    overlap = len(ta & tb)
    return overlap / min(len(ta), len(tb)) >= 0.6 and overlap / len(ta | tb) >= 0.3


def same_place(key_a: Optional[str], geo_a: Optional[Dict[str, Any]], key_b: Optional[str], geo_b: Optional[Dict[str, Any]]) -> bool:
    """Pinned positions decide when both sides have one; otherwise the written locations are compared."""
    apart = distance_m(geo_a, geo_b)
    if apart is not None:
        return apart <= SAME_PLACE_M
    return _same_text(key_a, key_b)


def is_case(incident: Dict[str, Any]) -> bool:
    """True for a report that stands for a problem itself, false for one filed under a case that was already open."""
    return (incident.get("registration") or {}).get("state") != "already_registered"


# --------------------------------------------------------------------------- #
# Finding earlier reports
# --------------------------------------------------------------------------- #

async def find_same_file(incident_id: str, sha256: Optional[str], before) -> Optional[Dict[str, Any]]:
    """The first earlier incident that submitted exactly the same file, if any."""
    if not sha256:
        return None
    db = get_database()
    m = await db.media_assets.find_one(
        {"sha256": sha256, "links.incident_id": {"$ne": incident_id}, "created_at": {"$lt": before}}, sort=[("created_at", 1)],
    )
    return await db.incidents.find_one({"_id": m["links"]["incident_id"], "status": "completed"}, _INCIDENT_FIELDS) if m else None


async def find_related_incidents(
    incident_id: str, issue_type_ids: List[str], loc_key: Optional[str], geo: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Other reports of the same kind of issue at the same place, newest first."""
    if not issue_type_ids or not (loc_key or geo):
        return []
    db = get_database()
    same_issue = {"_id": {"$ne": incident_id}, "status": "completed", "links.issue_type_ids": {"$in": issue_type_ids}}
    found: Dict[str, Dict[str, Any]] = {}

    if geo:
        # The 2dsphere index answers "what was reported within 100 m of here" directly.
        nearby = db.incidents.aggregate([
            {"$geoNear": {"near": geo, "distanceField": "distance_m", "maxDistance": SAME_PLACE_M, "spherical": True, "query": same_issue}},
            {"$project": {**_INCIDENT_FIELDS, "distance_m": 1}},
            {"$limit": 30},
        ])
        async for inc in nearby:
            inc["distance_m"] = round(inc["distance_m"], 1)
            found[inc["_id"]] = inc

    if loc_key:
        cursor = db.incidents.find({**same_issue, "location_key": {"$ne": None}}, _INCIDENT_FIELDS).sort("created_at", -1).limit(300)
        async for inc in cursor:
            if inc["_id"] not in found and same_place(loc_key, geo, inc.get("location_key"), inc.get("geo")):
                found[inc["_id"]] = {**inc, "distance_m": None}

    return sorted(found.values(), key=lambda i: i["created_at"], reverse=True)[:20]


async def attempts_for(incident_ids: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    """What was done about each of the given incidents and how every attempt turned out, oldest first."""
    if not incident_ids:
        return {}
    db = get_database()
    actions = await db.actions.find({"links.incident_id": {"$in": incident_ids}}).sort("created_at", 1).to_list(length=200)
    outcomes: Dict[str, Dict[str, Any]] = {}
    async for o in db.outcomes.find({"links.action_id": {"$in": [a["_id"] for a in actions]}}).sort("created_at", 1):
        outcomes[o["links"]["action_id"]] = o  # the latest inspection of each action wins
    by_incident: Dict[str, List[Dict[str, Any]]] = {}
    for a in actions:
        o = outcomes.get(a["_id"])
        by_incident.setdefault(a["links"]["incident_id"], []).append({
            "action_id": a["_id"],
            "outcome_id": o["_id"] if o else None,
            "what": a.get("notes") or a["action_type"].replace("_", " "),
            "result": "pending" if o is None else ("came_back" if o.get("recurrence_detected") else "held"),
            "observation": o["observation"] if o else None,
            "days": o.get("days_to_recurrence") if o else None,
            "at": a["created_at"],
        })
    return by_incident


async def find_similar_cases(
    incident_id: str, issue_type_ids: List[str], text: Optional[str], geo: Optional[Dict[str, Any]],
    exclude_ids: List[str], top_k: int = 3,
) -> List[Dict[str, Any]]:
    """
    Past cases of the same kind of problem at other places, the most instructive first.
    A case is worth showing when something was tried about it (so there is a result to learn from)
    or when its description closely matches this report's.
    """
    if not issue_type_ids:
        return []
    db = get_database()
    candidates = await db.incidents.find(
        {
            "_id": {"$nin": [incident_id, *exclude_ids]}, "status": "completed",
            "links.issue_type_ids": {"$in": issue_type_ids}, "registration.state": {"$ne": "already_registered"},
        },
        _INCIDENT_FIELDS,
    ).sort("created_at", -1).limit(300).to_list(length=300)
    if not candidates:
        return []

    tried = await attempts_for([c["_id"] for c in candidates])
    described = [c for c in candidates if c.get("citizen_text")] if text else []
    similarity: Dict[str, float] = {}
    if described:
        vectors = embedder.embed_cached([text] + [c["citizen_text"] for c in described])
        similarity = {c["_id"]: float(s) for c, s in zip(described, vectors[1:] @ vectors[0])}

    ranked = []
    for c in candidates:
        attempts = tried.get(c["_id"], [])
        instructive = 1.0 if any(a["result"] != "pending" for a in attempts) else (0.5 if attempts else 0.0)
        alike = similarity.get(c["_id"], 0.0)
        if not instructive and alike < CASE_HINT_MIN:
            continue
        apart = distance_m(geo, c.get("geo"))
        near = math.exp(-apart / 3000) if apart is not None else 0.0
        ranked.append((0.45 * instructive + 0.40 * alike + 0.15 * near, c, attempts, alike, apart))
    ranked.sort(key=lambda r: r[0], reverse=True)

    return [{
        "incident_id": c["_id"], "title": c.get("title"), "location": c.get("location"), "created_at": c["created_at"],
        "work_status": c.get("work_status", "open"), "tried": attempts,
        "similarity": round(alike, 2) if alike else None,
        "distance_m": round(apart) if apart is not None else None,
    } for _, c, attempts, alike, apart in ranked[:top_k]]


def present_here(related: List[Dict[str, Any]], tried: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """The other reports at this place, as the page shows them."""
    return [{
        "incident_id": r["_id"], "title": r.get("title"), "location": r.get("location"), "created_at": r["created_at"],
        "work_status": r.get("work_status", "open"), "tried": tried.get(r["_id"], []),
        "distance_m": round(r["distance_m"]) if r.get("distance_m") is not None else None,
        # Another report of the same open case, rather than a separate occurrence.
        "same_case": not is_case(r),
    } for r in related]


async def find_memories(
    issue_type_ids: List[str], incident_text: str, incident_id: Optional[str], loc_key: Optional[str],
    geo: Optional[Dict[str, Any]] = None, top_k: int = 3,
) -> List[Dict[str, Any]]:
    """
    Validated lessons that bear on this report: those learned at this very place, then those from
    elsewhere whose text is close enough to this report's to be worth checking.
    """
    if not issue_type_ids:
        return []
    db = get_database()
    query: Dict[str, Any] = {"links.issue_type_id": {"$in": issue_type_ids}, "status": {"$nin": ["draft", "retired"]}}
    if incident_id:
        # A lesson cannot be evidence for the very report it was drawn from.
        query["links.learned_from_incident_ids"] = {"$ne": incident_id}
    memories = await db.memories.find(query).to_list(length=200)
    if not memories:
        return []
    texts = [f"{m['title']}. {m['lesson_learned']} {m.get('historical_action_taken') or ''} Location: {m.get('location_tag') or ''}" for m in memories]
    vectors = embedder.embed_cached([incident_text] + texts)
    for m, score in zip(memories, vectors[1:] @ vectors[0]):
        m["relevance"] = round(float(score), 3)
        m["here"] = learned_at(m, loc_key, geo)
    kept = [m for m in memories if m["here"] or m["relevance"] >= LESSON_HINT_MIN]
    kept.sort(key=lambda m: (m["here"], m["relevance"]), reverse=True)
    return kept[:top_k]


def learned_at(memory: Dict[str, Any], loc_key: Optional[str], geo: Optional[Dict[str, Any]] = None) -> bool:
    """True when the lesson was learned at this very place."""
    return same_place(loc_key, geo, location_key(memory.get("location_tag")), memory.get("geo"))


# --------------------------------------------------------------------------- #
# Registration: new, already registered, or come back
# --------------------------------------------------------------------------- #

def _names(issue_type_ids: List[str]) -> str:
    labels = [taxonomy.BY_ID[t].label.lower() for t in issue_type_ids]
    return labels[0] if len(labels) == 1 else f"{', '.join(labels[:-1])} and {labels[-1]}"


def register(
    incident: Dict[str, Any], issue_type_ids: List[str], related: List[Dict[str, Any]], same_file: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    Decides what a report is, by looking at the reports made before it:

      already_registered  the same problem at the same place is an open case: this is one more report of it
      recurrence          the same problem was dealt with here before and has come back
      new                 nothing like it here before

    `same_file` (an earlier report of the identical photo or video) is only passed for a report
    that has no location at all, where the file is the one thing that can tell it was sent before.
    """
    if not issue_type_ids:
        return None
    primary = issue_type_ids[0]
    earlier = sorted((r for r in related if r["created_at"] < incident["created_at"]), key=lambda r: r["created_at"])
    by_file = same_file is not None and all(r["_id"] != same_file["_id"] for r in earlier)
    if by_file:
        earlier = sorted(earlier + [same_file], key=lambda r: r["created_at"])
    types_of = lambda r: r.get("links", {}).get("issue_type_ids", [])  # noqa: E731

    departments = sorted({taxonomy.BY_ID[t].department for t in issue_type_ids})
    base = {"case_id": incident["_id"], "report_number": 1, "first_reported_at": incident["created_at"],
            "departments": departments, "previous_id": None, "matched_by": None}

    case = next((r for r in earlier if primary in types_of(r) and is_case(r) and r.get("work_status", "open") in ACTIVE), None)
    if case:
        shared = [t for t in issue_type_ids if t in types_of(case)]
        return {
            **base, "state": "already_registered", "case_id": case["_id"], "first_reported_at": case["created_at"],
            "departments": sorted({taxonomy.BY_ID[t].department for t in shared}),
            "matched_by": "file" if by_file and case["_id"] == same_file["_id"] else "place",
            "issue_type_ids": shared, "new_issue_type_ids": [t for t in issue_type_ids if t not in shared],
        }

    previous = next((r for r in reversed(earlier) if primary in types_of(r) and r.get("work_status") in ("resolved", "recurred")), None)
    if previous:
        return {**base, "state": "recurrence", "previous_id": previous["_id"], "issue_type_ids": issue_type_ids, "new_issue_type_ids": []}
    return {**base, "state": "new", "issue_type_ids": issue_type_ids, "new_issue_type_ids": []}


def registration_message(registration: Dict[str, Any], media_kind: Optional[str] = None) -> str:
    """The one short sentence the person reporting is shown."""
    who = " and ".join(registration["departments"]) or "The ward office"
    what = _names(registration["issue_type_ids"][:1])
    if registration["state"] == "already_registered":
        subject = (f"This exact {'video' if media_kind == 'video' else 'photo'} was submitted before"
                   if registration["matched_by"] == "file" else f"The same {what} at this place is already on record")
        text = f"Already registered. {subject}; this is report no. {registration['report_number']} of it. {who} will take further action."
        if registration["new_issue_type_ids"]:
            text += f" New in this report and registered now: {_names(registration['new_issue_type_ids'])}."
        return text
    if registration["state"] == "recurrence":
        return f"Registered again. The same {what} was dealt with at this place before and has come back. {who} will take it up with the earlier repair in view."
    return f"Registered and assigned to {who}."


# --------------------------------------------------------------------------- #
# The recommendation
# --------------------------------------------------------------------------- #

def _ref(collection: str, _id: str) -> Dict[str, str]:
    return {"collection": collection, "id": _id}


def _ago(days: Optional[int]) -> str:
    if days is None:
        return ""
    return " the same day" if days <= 0 else f" within {days} day{'s' if days != 1 else ''}"


def _as_steps(protocol: str) -> List[str]:
    """
    A lesson's protocol as the steps it describes: split where it says "then" or starts a new sentence.
    "Clear the culvert first, then repair with hot-mix." becomes two steps.
    """
    parts = re.split(r"(?:(?<=[.;])\s+|,?\s+(?:and\s+)?then\s+)", protocol.strip())
    steps = [part.strip(" .;") for part in parts]
    return [step[0].upper() + step[1:] + "." for step in steps if len(step) > 2] or [protocol.strip()]


def _sentence(text: str) -> str:
    """Text typed by a person, closed with a full stop so that another sentence can follow it."""
    text = (text or "").strip()
    return text if text[-1:] in ".!?" else text + "."


def _phrase(issue: taxonomy.IssueType, count: int) -> str:
    return f"the {issue.label.lower()}" if count <= 1 else f"{count} {issue.plural}"


def recommend(
    primary_issue: Optional[str], memories: List[Dict[str, Any]], related: Optional[List[Dict[str, Any]]] = None,
    tried: Optional[Dict[str, List[Dict[str, Any]]]] = None, similar: Optional[List[Dict[str, Any]]] = None,
    *, counts: Optional[Dict[str, int]] = None, severity: Optional[int] = None, reports: int = 1, came_back: bool = False,
    repeat: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Builds the recommendation: an order ("Repair 3 potholes"), how soon, the steps, and what else
    the report shows. The steps come from evidence, strongest first:

      1. a lesson learned at this very place comes first — that is the point of remembering. One that lays
         out its own steps replaces the textbook procedure; a single instruction is put in front of it
      2. what was tried here before: a fix that held is repeated, a fix that failed is named so it is not repeated
      3. with neither, the standard procedure for the issue type, step by step
      4. one hint from elsewhere — a lesson that closely matches, or failing that a similar case with a
         known result — offered as something to check, never as the answer

    Every step, warning and piece of evidence names the document it came from.
    """
    if not primary_issue:
        return None
    issue = taxonomy.BY_ID[primary_issue]
    related, tried, similar = related or [], tried or {}, similar or []
    counts = counts or {primary_issue: 1}
    steps: List[Dict[str, Any]] = []
    avoid: List[Dict[str, Any]] = []
    evidence: List[Dict[str, Any]] = []
    source, because, memory_id = "standard_procedure", None, None
    standard = [{"text": text, "basis": "standard", "ref": _ref("issue_types", issue.id)} for text in (issue.steps or [issue.default_action])]

    mine = [m for m in memories if m["links"]["issue_type_id"] == primary_issue]
    here = next((m for m in mine if m.get("here")), None)
    covered = set(here["links"].get("action_ids", [])) if here else set()

    if here:
        source, because, memory_id = "memory", here.get("lesson_learned"), here["_id"]
        learned = _as_steps(here["recommended_protocol"])
        steps += [{"text": text, "basis": "memory", "ref": _ref("memories", here["_id"])} for text in learned]
        # A lesson that lays out its own sequence of work is the plan. One that gives a single
        # instruction ("check for pipe leaks") is what to do first: the repair itself still
        # follows the standard procedure.
        if len(learned) == 1:
            steps += standard
        summary = here["recommended_protocol"]
        if here.get("historical_action_taken"):
            avoid.append({"text": here["historical_action_taken"], "because": here.get("recorded_outcome"), "ref": _ref("memories", here["_id"])})
        evidence.append({**_ref("memories", here["_id"]), "label": here["title"], "relation": "Lesson learned at this place", "relevance": here.get("relevance")})

    # What was tried at this place, most recent first
    failed, held = False, None
    attempts = sorted((a for r in related for a in tried.get(r["_id"], [])), key=lambda a: a["at"], reverse=True)
    for a in attempts:
        if a["result"] == "pending":
            continue
        if a["result"] == "came_back":
            failed = True
            if a["action_id"] not in covered:
                avoid.append({"text": a["what"], "because": f"The problem came back{_ago(a['days'])}. {a['observation']}", "ref": _ref("actions", a["action_id"])})
            relation = "Tried here before and failed"
        else:
            held = held or a
            relation = "Tried here before and held"
        evidence.append({**_ref("outcomes", a["outcome_id"]), "label": a["observation"], "relation": relation})

    if not here:
        if held:
            source = "history"
            summary = f"Repeat what held here before: {held['what']}"
            steps.append({"text": summary, "basis": "history", "ref": _ref("actions", held["action_id"])})
        elif failed:
            source = "history"
            first = "Find out why the last repair here did not hold before repairing again."
            summary = f"{first} {issue.default_action}"
            steps += [{"text": first, "basis": "history", "ref": None}, *standard]
        else:
            summary = issue.default_action
            steps += standard

        lesson = next(iter(mine), None)
        # A case elsewhere only becomes advice when its description really resembles this one;
        # the others stay in the report's history for reference.
        case = next((c for c in similar if (c.get("similarity") or 0) >= CASE_HINT_MIN and any(a["result"] != "pending" for a in c["tried"])), None)
        if lesson:
            # What was learned there and what is advised there: without the second half the hint gives nothing to act on.
            steps.append({
                "text": f"A lesson from {lesson.get('location_tag') or 'another place'} may apply here too: {_sentence(lesson['lesson_learned'])} "
                        f"The advice there: {_sentence(lesson['recommended_protocol'])}",
                "basis": "similar_case", "ref": _ref("memories", lesson["_id"]),
            })
            evidence.append({
                **_ref("memories", lesson["_id"]), "label": lesson["title"],
                "relation": f"Lesson from {lesson.get('location_tag') or 'another place'}", "relevance": lesson.get("relevance"),
            })
        elif case:
            last = next(a for a in reversed(case["tried"]) if a["result"] != "pending")
            verdict = "did not hold" if last["result"] == "came_back" else "held"
            steps.append({
                "text": f"A similar case at {case.get('location') or 'another place'}: {last['what'].rstrip('. ')} — this {verdict}. Check whether the same applies here.",
                "basis": "similar_case", "ref": _ref("incidents", case["incident_id"]),
            })
            evidence.append({**_ref("incidents", case["incident_id"]), "label": case.get("title") or case["incident_id"],
                             "relation": f"Similar case at {case.get('location') or 'another place'}"})

    # The other kinds of problem in the same report: each goes to its own department with its own action.
    also = []
    for other_id, count in counts.items():
        if other_id == primary_issue or other_id not in taxonomy.BY_ID:
            continue
        other = taxonomy.BY_ID[other_id]
        lesson_here = next((m for m in memories if m["links"]["issue_type_id"] == other_id and m.get("here")), None)
        also.append({
            "issue_type_id": other_id,
            "what": other.label if count <= 1 else f"{count} {other.plural}",
            "department": other.department,
            "action": lesson_here["recommended_protocol"] if lesson_here else other.default_action,
            "basis": "memory" if lesson_here else "standard",
        })

    return {
        # The order in one line, and in one sentence. `text` is what is compared when asking whether advice changed.
        "headline": f"{issue.verb} {_phrase(issue, counts.get(primary_issue, 1))}",
        "text": summary,
        "source": source,
        "memory_id": memory_id,
        "because": because,
        "priority": taxonomy.priority_for(severity, reports, came_back, repeat),
        "department": issue.department,
        "steps": steps,
        "avoid": avoid,
        "also": also,
        "equipment": issue.equipment,
        "evidence": evidence,
        # What would have been recommended with no memory at all, kept for comparison.
        "baseline": issue.default_action,
    }


# --------------------------------------------------------------------------- #
# Search
# --------------------------------------------------------------------------- #

async def search_incidents(query: str, limit: int = 30) -> List[Dict[str, Any]]:
    """
    Finds past reports three ways and merges the results:

      keyword   MongoDB's text index over title, description and location
      partial   a case-insensitive fragment of the title or place ("manchi" finds Manchirevula)
      meaning   sentence-embedding similarity, so "broken lamp" finds "street light not working"

    Returns [{"_id", "score", "why"}], best first.
    """
    db = get_database()
    mine = {"is_seed": {"$ne": True}}
    query = query.strip()

    keyword: Dict[str, float] = {}
    async for d in db.incidents.find({**mine, "$text": {"$search": query}}, {"score": {"$meta": "textScore"}}).limit(200):
        keyword[d["_id"]] = d["score"]
    top = max(keyword.values(), default=1.0)

    fragment = {"$regex": re.escape(query), "$options": "i"}
    partial = {d["_id"] async for d in db.incidents.find(
        {**mine, "$or": [{"title": fragment}, {"location": fragment}, {"citizen_text": fragment}]}, {"_id": 1}).limit(200)}

    docs = await db.incidents.find({**mine, "status": "completed"}, {"title": 1, "citizen_text": 1, "location": 1}).sort("created_at", -1).limit(400).to_list(length=400)
    meaning: Dict[str, float] = {}
    if docs:
        texts = [" ".join(filter(None, [d.get("title"), d.get("citizen_text"), d.get("location")])) for d in docs]
        vectors = embedder.embed_cached([query] + texts)
        meaning = {d["_id"]: float(s) for d, s in zip(docs, vectors[1:] @ vectors[0])}

    results = []
    for _id in set(keyword) | partial | {i for i, s in meaning.items() if s >= 0.5}:
        k, p, m = keyword.get(_id, 0.0) / top, float(_id in partial), max(meaning.get(_id, 0.0), 0.0)
        results.append({"_id": _id, "score": round(0.4 * k + 0.2 * p + 0.4 * m, 3), "why": "keyword" if (k or p) else "meaning"})
    results.sort(key=lambda r: r["score"], reverse=True)
    return results[:limit]
