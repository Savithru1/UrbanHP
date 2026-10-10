"""
Measures what fine-tuning bought: runs the full UrbanHP detector on the held-out
test photos twice — without and with the fine-tuned pothole model — and compares
its potholes against the hand-drawn labels.

A predicted pothole counts as correct when it overlaps a labelled one by IoU >= 0.5.

Run:  .venv/Scripts/python training/evaluate.py
"""
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend"))

from app.core.config import settings  # noqa: E402
from app.services.detector import detector  # noqa: E402

TEST = HERE / "data" / "pothole_seg" / "test"


def labelled_boxes(label_file: Path):
    boxes = []
    for line in label_file.read_text().splitlines():
        pts = np.array(line.split()[1:], dtype=float).reshape(-1, 2)
        if len(pts) >= 3:
            boxes.append(tuple(float(v) for v in (pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max())))
    return boxes


def overlap(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - ix * iy
    return ix * iy / union if union > 0 else 0.0


def run(images, with_specialist: bool):
    detector.use_trained = with_specialist
    tp = fp = fn = flagged = with_potholes = 0
    per_box = []
    started = time.perf_counter()
    for image_path in images:
        truth = labelled_boxes(TEST / "labels" / (image_path.stem + ".txt"))
        found = [b for b in detector.detect(Image.open(image_path).convert("RGB")) if b.issue_type == "pothole"]
        with_potholes += bool(truth)
        flagged += bool(truth) and bool(found)
        boxed = sorted((b for b in found if not b.coarse), key=lambda b: b.confidence, reverse=True)
        unmatched = list(truth)
        for b in boxed:
            xyxy = (b.x, b.y, b.x + b.w, b.y + b.h)
            best = max(unmatched, key=lambda t: overlap(xyxy, t), default=None)
            hit = bool(best is not None and overlap(xyxy, best) >= 0.5)
            if hit:
                unmatched.remove(best)
            tp += hit
            fp += not hit
            per_box.append({"model": b.model, "confidence": b.confidence, "scores": b.scores, "correct": bool(hit)})
        fn += len(unmatched)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {
        "precision": round(precision, 3), "recall": round(recall, 3),
        "f1": round(2 * precision * recall / (precision + recall), 3) if precision + recall else 0.0,
        "correct": tp, "false_alarms": fp, "missed": fn,
        "photos_with_a_pothole_flagged": f"{flagged}/{with_potholes}",
        "seconds_per_photo": round((time.perf_counter() - started) / len(images), 2),
    }, per_box


def main():
    images = sorted((TEST / "images").glob("*.jpg"))
    detector.load()
    before, _ = run(images, with_specialist=False)
    after, per_box = run(images, with_specialist=True)
    print(f"{len(images)} held-out photos, {before['correct'] + before['missed']} labelled potholes")
    print("zero-shot only      :", json.dumps(before))
    print("with fine-tuned model:", json.dumps(after))

    report_file = settings.MODELS_PATH / "pothole-seg.json"
    report = json.loads(report_file.read_text()) if report_file.exists() else {}
    report["full_pipeline_on_test_photos"] = {"zero_shot_only": before, "with_fine_tuned_model": after}
    report_file.write_text(json.dumps(report, indent=2))
    (HERE / "runs" / "per_box.json").write_text(json.dumps(per_box))


if __name__ == "__main__":
    main()
