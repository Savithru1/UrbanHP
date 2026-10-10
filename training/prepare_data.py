"""
Fetches the two training datasets into training/data/:

    pothole_seg/   potholes, converted from COCO to the YOLO segmentation layout
                   https://huggingface.co/datasets/manot/pothole-segmentation (CC BY 4.0)
    crack_seg/     cracks, already in YOLO layout
                   https://docs.ultralytics.com/datasets/segment/crack-seg/
"""
import json
import shutil
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

from huggingface_hub import hf_hub_download

HERE = Path(__file__).resolve().parent
RAW = HERE / "data" / "pothole_seg_raw"
OUT = HERE / "data" / "pothole_seg"
CRACKS = HERE / "data" / "crack_seg"
CRACKS_URL = "https://github.com/ultralytics/assets/releases/download/v0.0.0/crack-seg.zip"


def fetch_cracks():
    if not (CRACKS / "images").exists():
        archive = HERE / "data" / "crack-seg.zip"
        print("downloading", CRACKS_URL)
        urllib.request.urlretrieve(CRACKS_URL, archive)
        with zipfile.ZipFile(archive) as z:
            z.extractall(HERE / "data")
        (HERE / "data" / "crack-seg").rename(CRACKS)
        archive.unlink()
    lines = [f"path: {CRACKS.as_posix()}", "train: images/train", "val: images/val", "test: images/test", "names:", "  0: crack", ""]
    (CRACKS / "data.yaml").write_text("\n".join(lines))
    counts = {split: len(list((CRACKS / "images" / split).glob("*"))) for split in ["train", "val", "test"]}
    print("cracks", counts, "wrote", CRACKS / "data.yaml")


def main():
    fetch_cracks()
    for split in ["train", "valid", "test"]:
        if not (RAW / split).exists():
            archive = hf_hub_download("manot/pothole-segmentation", f"data/{split}.zip", repo_type="dataset")
            with zipfile.ZipFile(archive) as z:
                z.extractall(RAW / split)

        coco = json.loads(next((RAW / split).rglob("*.json")).read_text())
        names = {c["id"]: c["name"] for c in coco["categories"]}
        images = {i["id"]: i for i in coco["images"]}
        by_image = {}
        for a in coco["annotations"]:
            by_image.setdefault(a["image_id"], []).append(a)

        (OUT / split / "images").mkdir(parents=True, exist_ok=True)
        (OUT / split / "labels").mkdir(parents=True, exist_ok=True)
        counts, kept = Counter(), 0
        for image_id, info in images.items():
            src = next((RAW / split).rglob(info["file_name"]), None)
            if src is None:
                continue
            w, h = info["width"], info["height"]
            lines = []
            for a in by_image.get(image_id, []):
                counts[names[a["category_id"]]] += 1
                for polygon in a.get("segmentation") or []:
                    if isinstance(polygon, list) and len(polygon) >= 6:
                        pts = [f"{min(max(v / (w if i % 2 == 0 else h), 0), 1):.5f}" for i, v in enumerate(polygon)]
                        lines.append("0 " + " ".join(pts))  # single class: pothole
            shutil.copy2(src, OUT / split / "images" / src.name)
            (OUT / split / "labels" / (src.stem + ".txt")).write_text("\n".join(lines))
            kept += 1
        print(f"{split:5s} images={kept:4d} categories={dict(counts)} size={next(iter(images.values()))['width']}x{next(iter(images.values()))['height']}")

    (OUT / "data.yaml").write_text(
        f"path: {OUT.as_posix()}\ntrain: train/images\nval: valid/images\ntest: test/images\nnames:\n  0: pothole\n"
    )
    print("wrote", OUT / "data.yaml")


if __name__ == "__main__":
    main()
