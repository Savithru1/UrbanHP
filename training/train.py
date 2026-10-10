"""
Fine-tunes a YOLO segmentation model for one kind of road damage, measures it on
held-out test photos and installs the result where the backend looks for it:

    backend/models/<name>-seg.pt      the trained weights
    backend/models/<name>-seg.json    how it scored on photos it never saw

Run:  .venv/Scripts/python training/prepare_data.py      (fetches both datasets)
      .venv/Scripts/python training/train.py pothole
      .venv/Scripts/python training/train.py crack
"""
import json
import shutil
import sys
from pathlib import Path

from ultralytics import YOLO
from ultralytics.utils import SETTINGS

HERE = Path(__file__).resolve().parent
MODELS = HERE.parent / "backend" / "models"
BASE = "yolo11s-seg.pt"

JOBS = {
    "pothole": {
        "data": str(HERE / "data" / "pothole_seg" / "data.yaml"),
        "dataset": "manot/pothole-segmentation (Roboflow 'road damage' v3, CC BY 4.0)",
        "epochs": 60,
        "fraction": 1.0,
    },
    "crack": {
        "data": str(HERE / "data" / "crack_seg" / "data.yaml"),
        "dataset": "Ultralytics crack-seg (Roboflow Universe crack segmentation)",
        "epochs": 25,
        # A third of the 3,717 training photos keeps this to about 20 minutes on a 4 GB laptop GPU.
        "fraction": 0.35,
    },
}


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "pothole"
    job = JOBS[name]
    # Ultralytics reports anonymous usage by default; switch that off for this run only
    # (set in memory, so the machine-wide Ultralytics settings file is left untouched).
    dict.__setitem__(SETTINGS, "sync", False)

    model = YOLO(BASE)
    model.train(
        data=job["data"], epochs=job["epochs"], fraction=job["fraction"], patience=15, imgsz=640, batch=8, workers=2,
        project=str(HERE / "runs"), name=name, exist_ok=True, seed=0, plots=False, verbose=False,
    )
    best = HERE / "runs" / name / "weights" / "best.pt"

    # Score on the test split, which took no part in training or model selection.
    metrics = YOLO(best).val(data=job["data"], split="test", imgsz=640, batch=8, workers=2, plots=False, verbose=False,
                             project=str(HERE / "runs"), name=f"{name}_test", exist_ok=True)
    report = {
        "base_model": BASE,
        "dataset": job["dataset"],
        "epochs": job["epochs"],
        "share_of_training_photos_used": job["fraction"],
        "test": {
            "box_precision": round(float(metrics.box.mp), 3), "box_recall": round(float(metrics.box.mr), 3),
            "box_mAP50": round(float(metrics.box.map50), 3), "box_mAP50_95": round(float(metrics.box.map), 3),
            "mask_precision": round(float(metrics.seg.mp), 3), "mask_recall": round(float(metrics.seg.mr), 3),
            "mask_mAP50": round(float(metrics.seg.map50), 3), "mask_mAP50_95": round(float(metrics.seg.map), 3),
        },
    }
    MODELS.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best, MODELS / f"{name}-seg.pt")
    report_file = MODELS / f"{name}-seg.json"
    previous = json.loads(report_file.read_text()) if report_file.exists() else {}
    report_file.write_text(json.dumps({**previous, **report}, indent=2))
    print("RESULT", json.dumps(report))


if __name__ == "__main__":
    main()
