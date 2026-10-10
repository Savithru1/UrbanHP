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
from app.core.database import get_database
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
) -> Dict[str, Any]:
    incident_id = f"inc_{now().strftime('%Y%m%d')}_{uuid.uuid4().hex[:6]}"
    text = (text or "").strip() or None
    location = (location or "").strip() or (extract_location(text) if text else None)

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
        "severity": None,
        "severity_label": None,
        "departments": [],
        "detection_count": 0,
        "is_recurring": False,
        "recommendation": None,
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

async def _finalize(incident: Dict[str, Any], media: Optional[Dict[str, Any]], detections: List[Dict[str, Any]], analysis: Dict[str, Any]):
    incident_id = incident["_id"]
    detections.sort(key=lambda d: (d["severity"], d["confidence"]), reverse=True)
    type_of = lambda d: d["links"]["issue_type_id"]  # noqa: E731

    counts = Counter(type_of(d) for d in detections)
    severity = max((d["severity"] for d in detections), default=None)
    worst = {t: max(d["severity"] for d in detections if type_of(d) == t) for t in counts}

    # What does the city already know about this?
    about = " ".join(filter(None, [
        ", ".join(taxonomy.BY_ID[t].label for t in counts), incident.get("citizen_text"),
        f"Location: {incident['location']}" if incident.get("location") else None,
    ]))
    memories = await linker.find_memories(list(counts), about)
    known_here = {m["links"]["issue_type_id"] for m in memories if linker.learned_at(m, incident.get("location_key"))}

    # Most severe issue first; ties go to one this place has a history with, then to the most frequent.
    issue_type_ids = sorted(counts, key=lambda t: (worst[t], t in known_here, counts[t]), reverse=True)
    primary = issue_type_ids[0] if issue_type_ids else None

    if detections:
        title = ", ".join(_count(t, counts[t]) for t in issue_type_ids)
        title = title[0].upper() + title[1:]
        summary = f"{incident['input_type'].capitalize()} report: {title.lower()}. Most severe: {taxonomy.BY_ID[primary].label.lower()} (severity {severity} of 5, {taxonomy.SEVERITY_LABELS[severity].lower()})."
    else:
        title = "No irregularities found"
        summary = f"{incident['input_type'].capitalize()} analysed: nothing matching a known civic issue was detected."

    duplicate_of = await linker.find_duplicate(incident_id, media.get("sha256") if media else None)
    # Re-sending the same file is a duplicate, not a new occurrence of the problem.
    related = [r for r in await linker.find_related_incidents(incident_id, issue_type_ids, incident.get("location_key")) if r != duplicate_of]

    # 1. Detections
    for d in detections:
        d["links"]["memory_ids"] = [m["_id"] for m in memories if m["links"]["issue_type_id"] == type_of(d)]
        await store.insert("detections", d, incident_id=incident_id,
                           summary=f"Detected: {d['label']} (severity {d['severity']}, {round(d['confidence'] * 100)}% confident)")

    # 2. The file now knows its size and what was found in it
    if media:
        facts = {k: media[k] for k in ("width", "height", "fps", "duration_s", "poster_url", "poster_time_s") if media.get(k) is not None}
        await store.update("media_assets", media["_id"], incident_id=incident_id,
                           summary=f"File analysed: linked to {len(detections)} detection(s)",
                           set={**facts, "links.detection_ids": [d["_id"] for d in detections if d["source"] != "text"]})

    # 3. Lessons that apply record where they were used
    for m in memories:
        await store.update("memories", m["_id"], incident_id=incident_id,
                           summary=f"Lesson '{m['title']}' attached to {incident_id}",
                           add={"links.used_by_incident_ids": incident_id}, inc={"times_used": 1}, set={"last_used_at": now()})

    # 4. Issue types keep count
    for t in issue_type_ids:
        await store.update("issue_types", t, incident_id=incident_id,
                           summary=f"{taxonomy.BY_ID[t].label}: {counts[t]} more detection(s) recorded",
                           inc={"stats.incidents": 1, "stats.detections": counts[t]},
                           set={"stats.last_detected_at": now(), "links.last_incident_id": incident_id})

    # 5. Earlier reports of the same problem point back at this one
    for r in related:
        await store.update("incidents", r, incident_id=incident_id,
                           summary=f"Reported again: linked to newer incident {incident_id}",
                           add={"links.related_incident_ids": incident_id}, set={"is_recurring": True})

    # 6. The incident itself
    await _update_incident(
        incident_id,
        f"Analysis completed: {title}",
        status="completed",
        title=title,
        summary=summary,
        severity=severity,
        severity_label=taxonomy.SEVERITY_LABELS.get(severity),
        departments=sorted({d["department"] for d in detections}),
        detection_count=len(detections),
        is_recurring=len(related) > 0,
        recommendation=linker.recommend(primary, memories, incident.get("location_key")),
        progress=None,
        analysis=analysis,
        **{
            "links.detection_ids": [d["_id"] for d in detections],
            "links.issue_type_ids": issue_type_ids,
            "links.memory_ids": [m["_id"] for m in memories],
            "links.related_incident_ids": related,
            "links.duplicate_of": duplicate_of,
        },
    )
    await broadcaster.broadcast("completed", {"incident_id": incident_id})
