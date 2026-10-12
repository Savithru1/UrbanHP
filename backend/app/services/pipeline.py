"""
The ingestion pipeline: takes an image, a video or a written complaint and
turns it into linked MongoDB documents, broadcasting progress live.

Every write goes through `store`, so each step also lands in `activity_log`:

    media_assets  created           the uploaded file
    incidents     created           status "received"
    incidents     updated           status "analyzing"
    detections    created  (x n)    one per irregularity found
    media_assets  updated           size, links to its detections
    memories      updated           linked lessons record that they were used
    issue_types   updated           counters and "last seen"
    incidents     updated           status "completed", all links filled in

Everything derived from the detections (title, severity, links, recommendation) can be
worked out again later with `reevaluate` — after a detection is rejected, a lesson is
edited, or an outcome is recorded — without running the vision models a second time.
"""
import asyncio
import base64
import hashlib
import logging
import time
import uuid
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from PIL import Image, ImageOps

from app import taxonomy
from app.core import store
from app.core.config import settings
from app.core.database import get_database, work_status_of
from app.core.events import broadcaster
from app.core.store import now
from app.services import linker
from app.services.detector import Box, detector
from app.services.text_analyzer import analyze_text, extract_location
from app.services.tracker import Tracker

logger = logging.getLogger("urbanhp.pipeline")

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff", ".jfif"}
VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".3gp", ".mpg", ".mpeg", ".wmv"}

# One analysis at a time: the GPU is shared.
_gpu_lock = asyncio.Lock()
_tasks: set = set()


def new_id(prefix: str, n: int = 8) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:n]}"


def kind_of(filename: str, content_type: str = "") -> Optional[str]:
    ext = Path(filename).suffix.lower()
    if ext in IMAGE_EXTS or content_type.startswith("image/"):
        return "image"
    if ext in VIDEO_EXTS or content_type.startswith("video/"):
        return "video"
    return None


def exif_position(path: Path) -> Optional[tuple]:
    """(latitude, longitude) stored in a photo by the camera that took it, if any."""
    try:
        gps = Image.open(path).getexif().get_ifd(0x8825)
        lat, lng = gps.get(2), gps.get(4)
        if not lat or not lng:
            return None
        degrees = lambda v: float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600  # noqa: E731
        latitude = -degrees(lat) if gps.get(1) == "S" else degrees(lat)
        longitude = -degrees(lng) if gps.get(3) == "W" else degrees(lng)
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180) or (latitude == 0 and longitude == 0):
            return None
        return latitude, longitude
    except Exception:
        return None


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# --------------------------------------------------------------------------- #
# Creating the incident (fast) — analysis then runs in the background
# --------------------------------------------------------------------------- #

async def create_incident(
    *, file_path: Optional[Path], file_name: Optional[str], kind: Optional[str],
    file_url: Optional[str], text: Optional[str], location: Optional[str],
    latitude: Optional[float] = None, longitude: Optional[float] = None,
    accuracy_m: Optional[float] = None, location_source: Optional[str] = None,
) -> Dict[str, Any]:
    incident_id = f"inc_{now().strftime('%Y%m%d')}_{uuid.uuid4().hex[:6]}"
    text = (text or "").strip() or None
    typed = (location or "").strip() or None
    location = typed or (extract_location(text) if text else None)
    source = "typed" if typed else ("text" if location else None)

    # A pinned position wins; failing that, the position the camera stored in the photo.
    geo = None
    if latitude is not None and longitude is not None:
        geo, source = linker.point(latitude, longitude), (location_source if location_source in ("gps", "pin") else "pin")
    elif file_path is not None and kind == "image":
        position = await asyncio.to_thread(exif_position, file_path)
        if position:
            geo, source, accuracy_m = linker.point(*position), "photo", None
    if geo and not location:
        location = f"{geo['coordinates'][1]:.5f}, {geo['coordinates'][0]:.5f}"

    media_id = None
    if file_path is not None:
        media_id = new_id("med")
        await store.insert("media_assets", {
            "_id": media_id,
            "kind": kind,
            "file_name": file_name,
            "url": file_url,
            "size_bytes": file_path.stat().st_size,
            "width": None,
            "height": None,
            "sha256": await asyncio.to_thread(sha256_of, file_path),
            "storage_path": str(file_path),
            "links": {"incident_id": incident_id, "detection_ids": []},
        }, summary=f"{kind.capitalize()} uploaded: {file_name}", incident_id=incident_id)

    incident = await store.insert("incidents", {
        "_id": incident_id,
        "input_type": kind or "text",
        "status": "received",
        "version": 1,
        "title": None,
        "summary": None,
        "citizen_text": text,
        "location": location,
        "location_key": linker.location_key(location),
        "geo": geo,
        "location_source": source,
        "location_accuracy_m": round(float(accuracy_m), 1) if geo and accuracy_m is not None else None,
        "severity": None,
        "severity_label": None,
        "departments": [],
        "detection_count": 0,
        "is_recurring": False,
        "work_status": "open",
        "registration": None,
        "report_count": 1,
        "recommendation": None,
        "feedback": None,
        "progress": None,
        "analysis": None,
        "links": {
            "media_id": media_id,
            "detection_ids": [],
            "issue_type_ids": [],
            "memory_ids": [],
            "related_incident_ids": [],
            "duplicate_of": None,
            "action_ids": [],
        },
    }, summary=f"{(kind or 'text').capitalize()} report received", incident_id=incident_id)
    await broadcaster.broadcast("incident", {"incident": incident})

    task = asyncio.create_task(_run(incident_id))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return incident


async def _update_incident(incident_id: str, note: str, record: bool = True, **fields) -> Dict[str, Any]:
    """Updates the incident (logged with `note`) and pushes the new version to the page."""
    incident = await store.update("incidents", incident_id, summary=note, incident_id=incident_id, set=fields, record=record)
    await broadcaster.broadcast("incident", {"incident": incident})
    return incident


async def _run(incident_id: str):
    db = get_database()
    try:
        async with _gpu_lock:
            incident = await db.incidents.find_one({"_id": incident_id})
            media_id = incident["links"]["media_id"]
            media = await db.media_assets.find_one({"_id": media_id}) if media_id else None
            started = time.perf_counter()
            await _update_incident(incident_id, "Analysis started", status="analyzing")

            detections: List[Dict[str, Any]] = []
            analysis: Dict[str, Any] = {}
            if media and media["kind"] == "image":
                detections, analysis = await _analyze_image(incident, media)
            elif media and media["kind"] == "video":
                detections, analysis = await _analyze_video(incident, media)

            if incident.get("citizen_text"):
                detections += _text_detections(incident, media, detections)

            analysis["duration_ms"] = int((time.perf_counter() - started) * 1000)
            await _finalize(incident, media, detections, analysis)
    except Exception as e:
        logger.exception("Analysis of %s failed", incident_id)
        await _update_incident(incident_id, f"Analysis failed: {e}", status="failed", progress=None, error=str(e))


# --------------------------------------------------------------------------- #
# Image
# --------------------------------------------------------------------------- #

async def _analyze_image(incident: Dict[str, Any], media: Dict[str, Any]):
    path = Path(media["storage_path"])

    def work():
        img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        return img, detector.detect(img)

    img, boxes = await asyncio.to_thread(work)
    media.update(width=img.width, height=img.height)

    detections = []
    for box in boxes:
        det = _detection_doc(incident, media, box, source="image")
        det["snapshot_url"] = await asyncio.to_thread(_save_crop, np.asarray(img)[:, :, ::-1], box, det["_id"])
        detections.append(det)

    await broadcaster.broadcast("frame", {
        "incident_id": incident["_id"], "index": 1, "total": 1, "time_s": 0,
        "boxes": [_overlay(d["_id"], d) for d in detections],
    })
    return detections, {**detector.describe(), "frames_analyzed": 1}


# --------------------------------------------------------------------------- #
# Video
# --------------------------------------------------------------------------- #

async def _analyze_video(incident: Dict[str, Any], media: Dict[str, Any]):
    path = Path(media["storage_path"])
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError("This video format could not be opened")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    if not (1 <= fps <= 240):
        fps = 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    stride = max(1, round(fps / settings.VIDEO_SAMPLE_FPS))
    if total_frames and total_frames / stride > settings.VIDEO_MAX_FRAMES:
        stride = int(np.ceil(total_frames / settings.VIDEO_MAX_FRAMES))
    planned = max(1, int(np.ceil(total_frames / stride))) if total_frames else 0
    step_s = stride / fps

    media.update(
        width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0), height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0),
        fps=round(fps, 2), duration_s=round(total_frames / fps, 2) if total_frames else None,
    )

    tracker = Tracker(max_gap_s=max(1.0, step_s * 2.5))
    best_crops: Dict[int, tuple] = {}  # track id -> (confidence, frame, box)
    poster = (-1, None, 0.0)  # (box count, frame, time)
    analysed = 0
    frame_index = -1
    last_progress = 0.0

    def read_next():
        """Reads the next sampled frame, skipping the ones in between."""
        nonlocal frame_index
        while True:
            if not cap.grab():
                return None
            frame_index += 1
            if frame_index % stride == 0:
                ok, frame = cap.retrieve()
                return frame if ok else None

    try:
        while True:
            frame = await asyncio.to_thread(read_next)
            if frame is None:
                break
            time_s = frame_index / fps
            rgb = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            boxes = await asyncio.to_thread(detector.detect, rgb)
            matches = tracker.update(time_s, frame, boxes)
            analysed += 1

            for track, box in matches:
                if track.id not in best_crops or box.confidence > best_crops[track.id][0]:
                    best_crops[track.id] = (box.confidence, frame, box)
            if len(boxes) > poster[0]:
                poster = (len(boxes), frame, time_s)

            await broadcaster.broadcast("frame", {
                "incident_id": incident["_id"],
                "index": analysed,
                "total": planned or analysed,
                "time_s": round(time_s, 3),
                "image": await asyncio.to_thread(_preview_jpeg, frame),
                "boxes": [_overlay(f"trk_{t.id}", _shape_fields(b)) for t, b in matches],
            })
            # Keep the incident document itself current, so progress is visible in Compass too.
            if time.perf_counter() - last_progress > 2.0:
                last_progress = time.perf_counter()
                await _update_incident(incident["_id"], "Video analysis progress", record=False,
                                       progress={"frames_done": analysed, "frames_total": planned or analysed})
    finally:
        cap.release()

    detections = []
    for track in tracker.confirmed():
        best_time, best_box = track.best
        # Size comes from the closest view of the object, the label from the clearest.
        largest = max((b for _, b in track.points), key=lambda b: b.area)
        det = _detection_doc(incident, media, best_box, source="video", area=largest.area)
        det["video"] = {
            "first_seen_s": round(track.first_time, 2),
            "last_seen_s": round(track.last_time, 2),
            "frames_seen": len(track.points),
            "best_frame_s": round(best_time, 2),
            "path": [{"t": round(t, 3), **b.as_bbox(), "mask": b.mask} for t, b in track.points],
        }
        if track.id in best_crops:
            _, src, box = best_crops[track.id]
            det["snapshot_url"] = await asyncio.to_thread(_save_crop, src, box, det["_id"])
        detections.append(det)

    if poster[1] is not None:
        poster_name = f"{incident['_id']}_poster.jpg"
        await asyncio.to_thread(cv2.imwrite, str(settings.SNAPSHOT_PATH / poster_name), poster[1])
        media.update(poster_url=f"/uploads/snapshots/{poster_name}", poster_time_s=round(poster[2], 2))

    return detections, {**detector.describe(), "frames_analyzed": analysed, "sample_interval_s": round(step_s, 3)}


def _preview_jpeg(frame: np.ndarray, max_width: int = 960) -> str:
    h, w = frame.shape[:2]
    if w > max_width:
        frame = cv2.resize(frame, (max_width, int(h * max_width / w)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 72])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def _save_crop(frame_bgr: np.ndarray, box: Box, det_id: str) -> str:
    """Saves a close-up of the detected object (with a little context around it)."""
    h, w = frame_bgr.shape[:2]
    pad_x, pad_y = box.w * 0.15, box.h * 0.15
    x1, y1 = int(max(0, box.x - pad_x) * w), int(max(0, box.y - pad_y) * h)
    x2, y2 = int(min(1, box.x + box.w + pad_x) * w), int(min(1, box.y + box.h + pad_y) * h)
    crop = frame_bgr[y1:max(y2, y1 + 1), x1:max(x2, x1 + 1)]
    if max(crop.shape[:2]) > 640:
        scale = 640 / max(crop.shape[:2])
        crop = cv2.resize(crop, (max(1, int(crop.shape[1] * scale)), max(1, int(crop.shape[0] * scale))), interpolation=cv2.INTER_AREA)
    name = f"{det_id}.jpg"
    cv2.imwrite(str(settings.SNAPSHOT_PATH / name), crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return f"/uploads/snapshots/{name}"


# --------------------------------------------------------------------------- #
# Building documents
# --------------------------------------------------------------------------- #

def _shape_fields(box: Box, area: Optional[float] = None) -> Dict[str, Any]:
    """What a detection is and where it sits in the frame."""
    issue = taxonomy.BY_ID[box.issue_type]
    # A coarse region says nothing about the object's size, so severity falls back to the hazard level.
    severity = taxonomy.severity_from_hazard(issue) if box.coarse else taxonomy.severity_from_area(issue, area if area is not None else box.area)
    return {
        "issue_type_id": issue.id,
        "label": issue.label,
        "severity": severity,
        "severity_label": taxonomy.SEVERITY_LABELS[severity],
        "confidence": round(float(box.confidence), 3),
        "bbox": box.as_bbox(),
        "mask": box.mask,
        "approximate_location": box.coarse,
    }


def _overlay(box_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
    """The part of a detection the page needs in order to draw it."""
    issue_type = fields.get("issue_type_id") or fields["links"]["issue_type_id"]
    return {"id": box_id, "issue_type": issue_type,
            **{k: fields[k] for k in ("label", "severity", "confidence", "bbox", "mask", "approximate_location")}}


def _detection_doc(incident: Dict[str, Any], media: Optional[Dict[str, Any]], box: Box, source: str, area: Optional[float] = None) -> Dict[str, Any]:
    issue = taxonomy.BY_ID[box.issue_type]
    shape = _shape_fields(box, area)
    issue_type_id = shape.pop("issue_type_id")
    return {
        "_id": new_id("det"),
        **shape,
        "area_pct": round((area if area is not None else box.area) * 100, 2),
        "source": source,
        "department": issue.department,
        "meaning": issue.description,
        "suggested_action": issue.default_action,
        "snapshot_url": None,
        "model": {"name": box.model, "scores": box.scores},
        "status": "open",
        "links": {"incident_id": incident["_id"], "media_id": media["_id"] if media else None, "issue_type_id": issue_type_id, "memory_ids": []},
    }


def _text_detections(incident: Dict[str, Any], media: Optional[Dict[str, Any]], visual: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Issues described in the written report. With media attached, adds only what the camera did not show."""
    seen = {d["links"]["issue_type_id"] for d in visual}
    docs = []
    for i in analyze_text(incident["citizen_text"]):
        if i.issue_type in seen or (visual and i.issue_type == "other"):
            continue
        issue = taxonomy.BY_ID[i.issue_type]
        docs.append({
            "_id": new_id("det"),
            "label": issue.label,
            "severity": i.severity,
            "severity_label": taxonomy.SEVERITY_LABELS[i.severity],
            "confidence": float(i.confidence),
            "bbox": None,
            "mask": None,
            "approximate_location": False,
            "source": "text",
            "department": issue.department,
            "meaning": issue.description,
            "suggested_action": issue.default_action,
            "snapshot_url": None,
            "text": {"evidence": i.evidence, "matched_keyword": i.matched},
            "model": {"name": "text-analyzer", "scores": {"match": float(i.confidence)}},
            "status": "open",
            "links": {"incident_id": incident["_id"], "media_id": media["_id"] if media else None, "issue_type_id": issue.id, "memory_ids": []},
        })
    return docs


def _count(issue_id: str, n: int) -> str:
    issue = taxonomy.BY_ID[issue_id]
    return f"1 {issue.label.lower()}" if n == 1 else f"{n} {issue.plural}"


# --------------------------------------------------------------------------- #
# Saving the result and linking it to everything else
# --------------------------------------------------------------------------- #

async def _derive(incident: Dict[str, Any], media: Optional[Dict[str, Any]], detections: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Everything that follows from an incident's detections: its summary, its links and its recommendation."""
    incident_id = incident["_id"]
    active = [d for d in detections if d.get("status") != "rejected"]
    active.sort(key=lambda d: (d["severity"], d["confidence"]), reverse=True)
    type_of = lambda d: d["links"]["issue_type_id"]  # noqa: E731

    counts = Counter(type_of(d) for d in active)
    severity = max((d["severity"] for d in active), default=None)
    worst = {t: max(d["severity"] for d in active if type_of(d) == t) for t in counts}
    loc_key, geo = incident.get("location_key"), incident.get("geo")

    # What does the city already know about this?
    about = " ".join(filter(None, [
        ", ".join(taxonomy.BY_ID[t].label for t in counts), incident.get("citizen_text"),
        f"Location: {incident['location']}" if incident.get("location") else None,
    ]))
    memories = await linker.find_memories(list(counts), about, incident_id, loc_key, geo)
    known_here = {m["links"]["issue_type_id"] for m in memories if m["here"]}

    # Most severe issue first; ties go to one this place has a history with, then to the most frequent.
    issue_type_ids = sorted(counts, key=lambda t: (worst[t], t in known_here, counts[t]), reverse=True)
    primary = issue_type_ids[0] if issue_type_ids else None

    if active:
        title = ", ".join(_count(t, counts[t]) for t in issue_type_ids)
        title = title[0].upper() + title[1:]
        summary = f"{incident['input_type'].capitalize()} report: {title.lower()}. Most severe: {taxonomy.BY_ID[primary].label.lower()} (severity {severity} of 5, {taxonomy.SEVERITY_LABELS[severity].lower()})."
    else:
        title = "No irregularities found"
        summary = f"{incident['input_type'].capitalize()} analysed: nothing matching a known civic issue was detected."

    same_file = await linker.find_same_file(incident_id, media.get("sha256") if media else None, incident["created_at"])
    related = await linker.find_related_incidents(incident_id, issue_type_ids, loc_key, geo)
    tried = await linker.attempts_for([r["_id"] for r in related])
    similar = await linker.find_similar_cases(incident_id, issue_type_ids, incident.get("citizen_text"), geo, [r["_id"] for r in related])
    registration = await _register(incident, media, issue_type_ids, related, same_file)
    # How often the problem has been reported: for a repeat report, its own place in the count.
    repeat = bool(registration) and registration["state"] == "already_registered"
    reports = registration["report_number"] if repeat else (incident.get("report_count") or 1)
    came_back = bool(registration) and registration["state"] == "recurrence"

    return {
        "counts": counts,
        "memories": memories,
        "related_ids": [r["_id"] for r in related],
        "registration": registration,
        "fields": {
            "title": title,
            "summary": summary,
            "severity": severity,
            "severity_label": taxonomy.SEVERITY_LABELS.get(severity),
            "departments": sorted({d["department"] for d in active}),
            "detection_count": len(active),
            # The problem was dealt with here before and is back (not: someone else reported it too).
            "is_recurring": came_back,
            "registration": registration,
            "recommendation": linker.recommend(primary, memories, related, tried, similar,
                                               counts=dict(counts), severity=severity, reports=reports, came_back=came_back, repeat=repeat),
            "links.detection_ids": [d["_id"] for d in detections],
            "links.issue_type_ids": issue_type_ids,
            "links.memory_ids": [m["_id"] for m in memories],
            "links.related_incident_ids": [r["_id"] for r in related],
            "links.duplicate_of": same_file["_id"] if same_file else None,
        },
    }


async def _register(incident: Dict[str, Any], media: Optional[Dict[str, Any]], issue_type_ids: List[str],
                    related: List[Dict[str, Any]], same_file: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Whether this report is new, one more report of an open case, or a problem that has come back.
    That is a fact about the moment it was reported, so once decided it is kept — unless the
    case it was filed under no longer exists, or what the report shows has changed.
    """
    db = get_database()
    kept = incident.get("registration")
    if kept and issue_type_ids and kept.get("issue_type_ids", [])[:1] == issue_type_ids[:1]:
        if kept["state"] == "already_registered":
            # Still valid while the case exists and is itself a case, not a report filed elsewhere.
            still = await db.incidents.count_documents({"_id": kept["case_id"], "registration.state": {"$ne": "already_registered"}}, limit=1)
        elif kept["state"] == "recurrence":
            still = await db.incidents.count_documents({"_id": kept["previous_id"]}, limit=1)
        else:
            still = True
        if still:
            return kept

    # With a location, the place decides. Without one, the identical file is the only way to recognise it.
    located = bool(incident.get("location_key") or incident.get("geo"))
    registration = linker.register(incident, issue_type_ids, related, None if located else same_file)
    if registration is None:
        return None
    if registration["state"] == "already_registered":
        earlier = await db.incidents.count_documents({
            "_id": {"$ne": incident["_id"]}, "created_at": {"$lt": incident["created_at"]},
            "registration.case_id": registration["case_id"], "registration.state": "already_registered",
        })
        registration["report_number"] = earlier + 2
    registration["message"] = linker.registration_message(registration, media["kind"] if media else None)
    return registration


async def _sync_case(incident_id: str, registration: Optional[Dict[str, Any]]):
    """
    Keeps a case in step with the reports filed under it: follow-up is tracked once, on the case,
    and the case knows how many times it has been reported.
    """
    db = get_database()
    if not registration:
        return
    case_id = registration["case_id"]

    if case_id != incident_id:
        # A report that turns out to belong to an open case hands its follow-up over to the case.
        moved = [a["_id"] async for a in db.actions.find({"links.incident_id": incident_id}, {"_id": 1})]
        if moved:
            note = f"Moved to {case_id}, the case this report belongs to"
            for action_id in moved:
                await store.update("actions", action_id, incident_id=case_id, summary=note, set={"links.incident_id": case_id})
            async for o in db.outcomes.find({"links.incident_id": incident_id}, {"_id": 1}):
                await store.update("outcomes", o["_id"], incident_id=case_id, summary=note, set={"links.incident_id": case_id})
            async for m in db.memories.find({"links.learned_from_incident_ids": incident_id}, {"_id": 1}):
                await store.update("memories", m["_id"], incident_id=case_id, summary=note,
                                   pull={"links.learned_from_incident_ids": incident_id})
                await store.update("memories", m["_id"], incident_id=case_id, summary=note,
                                   add={"links.learned_from_incident_ids": case_id})
            await _update_incident(incident_id, "Follow-up handed over to the case", **{"links.action_ids": [], "work_status": "open"})
            case = await store.update("incidents", case_id, incident_id=case_id, summary=f"Took over the follow-up recorded on {incident_id}",
                                      add={"links.action_ids": moved}, set={"work_status": await work_status_of(db, case_id)})
            await broadcaster.broadcast("incident", {"incident": case})

        # A report filed under a case does not count reports of its own.
        await db.incidents.update_one({"_id": incident_id, "report_count": {"$ne": 1}}, {"$set": {"report_count": 1}})

    reports = await db.incidents.count_documents({"registration.case_id": case_id, "registration.state": "already_registered"}) + 1
    case = await db.incidents.find_one({"_id": case_id}, {"report_count": 1})
    if case and case.get("report_count") != reports:
        await store.update("incidents", case_id, incident_id=incident_id,
                           summary=f"Reported {reports} times now" if reports > 1 else "No other reports of it remain",
                           set={"report_count": reports})
        # How often a problem is reported is part of its priority, so the case's advice is brought up to date.
        await reevaluate(case_id, "Reported again" if reports > 1 else "Report count changed")


def _memory_ids_for(detection: Dict[str, Any], memories: List[Dict[str, Any]]) -> List[str]:
    return [m["_id"] for m in memories if m["links"]["issue_type_id"] == detection["links"]["issue_type_id"]]


async def _link_others(incident: Dict[str, Any], plan: Dict[str, Any], first_time: bool):
    """Brings the documents an incident points at in step with it: lessons, issue types and earlier reports."""
    db = get_database()
    incident_id, old = incident["_id"], incident["links"]
    new_memories, new_related, new_types = plan["fields"]["links.memory_ids"], plan["related_ids"], plan["fields"]["links.issue_type_ids"]
    title_of = {m["_id"]: m["title"] for m in plan["memories"]}

    # Lessons record where they were used
    for memory_id in new_memories:
        if memory_id not in old["memory_ids"]:
            await store.update("memories", memory_id, incident_id=incident_id,
                               summary=f"Lesson '{title_of[memory_id]}' attached to {incident_id}",
                               add={"links.used_by_incident_ids": incident_id}, inc={"times_used": 1}, set={"last_used_at": now()})
    for memory_id in old["memory_ids"]:
        if memory_id not in new_memories:
            await store.update("memories", memory_id, incident_id=incident_id, summary=f"Lesson no longer applies to {incident_id}",
                               pull={"links.used_by_incident_ids": incident_id}, inc={"times_used": -1})

    # Issue types keep count (the incident's own links are written last, so it is counted separately here)
    for t in dict.fromkeys(new_types + old["issue_type_ids"]):
        stats = {
            "stats.incidents": await db.incidents.count_documents({"links.issue_type_ids": t, "_id": {"$ne": incident_id}}) + int(t in new_types),
            "stats.detections": await db.detections.count_documents({"links.issue_type_id": t, "status": {"$ne": "rejected"}}),
        }
        current = (await db.issue_types.find_one({"_id": t}, {"stats": 1}) or {}).get("stats", {})
        if first_time and t in new_types:
            await store.update("issue_types", t, incident_id=incident_id,
                               summary=f"{taxonomy.BY_ID[t].label}: {plan['counts'][t]} more detection(s) recorded",
                               set={**stats, "stats.last_detected_at": now(), "links.last_incident_id": incident_id})
        elif any(current.get(k.split(".")[1]) != v for k, v in stats.items()):
            await store.update("issue_types", t, incident_id=incident_id,
                               summary=f"{taxonomy.BY_ID[t].label}: counters recalculated", set=stats)

    # Earlier reports of the same problem point back at this one
    for r in new_related:
        if r not in old["related_incident_ids"]:
            await store.update("incidents", r, incident_id=incident_id,
                               summary=f"Same problem, same place: linked to {incident_id}",
                               add={"links.related_incident_ids": incident_id})
    for r in old["related_incident_ids"]:
        if r not in new_related:
            await store.update("incidents", r, incident_id=incident_id, summary=f"No longer the same problem as {incident_id}",
                               pull={"links.related_incident_ids": incident_id})


async def _finalize(incident: Dict[str, Any], media: Optional[Dict[str, Any]], detections: List[Dict[str, Any]], analysis: Dict[str, Any]):
    incident_id = incident["_id"]
    detections.sort(key=lambda d: (d["severity"], d["confidence"]), reverse=True)
    plan = await _derive(incident, media, detections)

    # 1. Detections
    for d in detections:
        d["links"]["memory_ids"] = _memory_ids_for(d, plan["memories"])
        await store.insert("detections", d, incident_id=incident_id,
                           summary=f"Detected: {d['label']} (severity {d['severity']}, {round(d['confidence'] * 100)}% confident)")

    # 2. The file now knows its size and what was found in it
    if media:
        facts = {k: media[k] for k in ("width", "height", "fps", "duration_s", "poster_url", "poster_time_s") if media.get(k) is not None}
        await store.update("media_assets", media["_id"], incident_id=incident_id,
                           summary=f"File analysed: linked to {len(detections)} detection(s)",
                           set={**facts, "links.detection_ids": [d["_id"] for d in detections if d["source"] != "text"]})

    # 3. Lessons, issue types and earlier reports of the same problem
    await _link_others(incident, plan, first_time=True)

    # 4. The incident itself
    await _update_incident(incident_id, f"Analysis completed: {plan['fields']['title']}",
                           status="completed", progress=None, analysis=analysis, **plan["fields"])
    await _sync_case(incident_id, plan["registration"])
    await broadcaster.broadcast("completed", {"incident_id": incident_id})


async def sync_case(case_id: str):
    """Recounts how many times a case has been reported (after one of its reports was removed)."""
    await _sync_case(case_id, {"case_id": case_id})


def _describe(recommendation: Optional[Dict[str, Any]]) -> str:
    names = {"memory": "a lesson learned here", "history": "what was tried here before", "standard_procedure": "the standard procedure"}
    return names.get((recommendation or {}).get("source"), "none")


def _advice(recommendation: Optional[Dict[str, Any]]):
    """The part of a recommendation a person acts on. Hints from similar cases elsewhere are left out."""
    if not recommendation:
        return None
    return (recommendation.get("source"), recommendation.get("text"), recommendation.get("memory_id"),
            [a["text"] for a in recommendation.get("avoid") or []])


async def upgrade_reports():
    """
    Reports analysed by an earlier version are worked out again, once each: they get a registration
    (new / already registered / came back) and a recommendation in its current form — headline,
    priority, steps and evidence.
    Oldest first, so that a case exists before the later reports of it are filed under it.
    """
    db = get_database()
    old = {"status": "completed", "is_seed": {"$ne": True}, "links.issue_type_ids": {"$ne": []}, "$or": [
        {"registration": None},
        {"recommendation": {"$ne": None}, "recommendation.priority": {"$exists": False}},
        # A one-line lesson used to be the whole plan; now the standard procedure follows it.
        {"recommendation.source": "memory", "recommendation.steps": {"$size": 1}},
        # A hint from a lesson elsewhere used to leave out what that lesson advises.
        {"recommendation.steps.text": {"$regex": "^Check whether this applies here too"}},
    ]}
    for incident_id in [i["_id"] async for i in db.incidents.find(old, {"_id": 1}).sort("created_at", 1)]:
        await reevaluate(incident_id, "Brought up to date")


async def reevaluate(incident_id: str, reason: str = "Re-evaluated") -> Optional[Dict[str, Any]]:
    """
    Works out an incident's summary, links and recommendation again from its stored detections
    and from what the city knows now. Returns what the recommendation was and what it is, or
    None when the incident does not exist or has not finished analysing.
    """
    db = get_database()
    incident = await db.incidents.find_one({"_id": incident_id})
    if not incident or incident["status"] != "completed":
        return None
    links = incident["links"]
    media = await db.media_assets.find_one({"_id": links["media_id"]}) if links.get("media_id") else None
    detections = await db.detections.find({"links.incident_id": incident_id}).sort([("severity", -1), ("confidence", -1)]).to_list(length=1000)
    plan = await _derive(incident, media, detections)

    for d in detections:
        memory_ids = _memory_ids_for(d, plan["memories"]) if d.get("status") != "rejected" else []
        if memory_ids != d["links"].get("memory_ids", []):
            await store.update("detections", d["_id"], incident_id=incident_id,
                               summary=f"{d['label']}: lessons that apply were updated", set={"links.memory_ids": memory_ids})
    await _link_others(incident, plan, first_time=False)

    before, after = incident.get("recommendation"), plan["fields"]["recommendation"]
    changed_fields = {k: v for k, v in plan["fields"].items() if store.dig(incident, k) != v}
    rec_changed = _advice(before) != _advice(after)
    if changed_fields:
        note = f"{reason}: recommendation now follows {_describe(after)} (was {_describe(before)})" if rec_changed else f"{reason}: details updated"
        await _update_incident(incident_id, note, **changed_fields)
    await _sync_case(incident_id, plan["registration"])
    return {"incident_id": incident_id, "title": plan["fields"]["title"], "changed": rec_changed, "before": before, "after": after}
