"""
Vision detector: finds civic irregularities in an image or video frame and
outlines each one.

Potholes and road cracks go to models that were fine-tuned on labelled photos
(see `training/`). Everything else is found zero-shot in three stages, each
doing the one thing it is good at:

  1. WHAT  — a zero-shot image classifier (SigLIP 2) scores the picture against
             every issue in the taxonomy and against "nothing wrong here" scenes.
             Only issues that clearly win go forward, so a clean street stays clean.
  2. WHERE — an open-vocabulary box detector (Grounding DINO) localises just the
             issues found in stage 1.
  3. CHECK — every box is cropped and shown to the classifier again; boxes that
             look more like a harmless look-alike (a closed manhole cover, a
             working street light) are dropped.

Finally a segmentation model (SAM 2) turns each box into the exact outline of
the object, which is what gets drawn on the picture.
"""
import logging
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import torch
from PIL import Image
from torchvision.ops import nms

from app.core.config import settings
from app import taxonomy

logger = logging.getLogger("urbanhp.detector")

# Stage 1: an issue the classifier is this sure about is reported even if no box survives.
PRESENT_SURE = 0.50
# Stage 2: minimum box score from the detector.
BOX_MIN = 0.25
# Issues that look alike (a heap of rubbish vs. a heap of rubble): only the likelier one is kept.
EITHER_OR = [("garbage", "road_obstruction")]
# A fallen tree is the obstruction; it is not reported a second time as one.
SUBSUMES = [("fallen_tree", "road_obstruction")]
# Stage 3: minimum classifier probability for a cropped box.
CROP_MIN = 0.15

ZERO_SHOT = "zero-shot"


@dataclass(frozen=True)
class Trained:
    """A model fine-tuned for one issue type (see training/train.py)."""
    issue_type: str
    file: str
    name: str
    # Boxes below this confidence are ignored...
    min_confidence: float
    # ...unless the scene classifier is already SCENE_SURE that the issue is in the picture,
    # in which case fainter boxes down to this confidence are believed too.
    min_confidence_sure: float


TRAINED = [
    Trained("pothole", "pothole-seg.pt", "pothole-specialist", 0.45, 0.30),
    Trained("road_crack", "crack-seg.pt", "crack-specialist", 0.45, 0.30),
]
SCENE_SURE = 0.80
# The trained models only ever saw road photos, so elsewhere they can mistake other things for
# damage (the pattern on a manhole cover, a hole in a pole). Their boxes are therefore kept only
# when the scene classifier sees at least this much evidence of road damage in the picture.
# Measured on 231 labelled pothole photos and 57 photos without potholes: this keeps 95% of
# the correct boxes and removed every false pothole report on the photos without one.
ROAD_DAMAGE_MIN = 0.10


@dataclass
class Box:
    issue_type: str
    confidence: float
    # Fractions (0-1) of the frame; x, y is the top-left corner.
    x: float
    y: float
    w: float
    h: float
    # True when the issue was recognised but could only be placed roughly.
    coarse: bool = False
    scores: Dict[str, float] = field(default_factory=dict)
    # Outline of the object: [x, y] points as fractions (0-1) of the frame.
    mask: Optional[List[List[float]]] = None
    # Which model found it.
    model: str = ZERO_SHOT

    @property
    def area(self) -> float:
        return self.w * self.h

    def as_bbox(self) -> Dict[str, float]:
        return {"x": round(self.x, 4), "y": round(self.y, 4), "w": round(self.w, 4), "h": round(self.h, 4)}


def iou(a: Box, b: Box) -> float:
    ix = max(0.0, min(a.x + a.w, b.x + b.w) - max(a.x, b.x))
    iy = max(0.0, min(a.y + a.h, b.y + b.h) - max(a.y, b.y))
    inter = ix * iy
    union = a.area + b.area - inter
    return inter / union if union > 0 else 0.0


# Regions the classifier looks at: the whole frame plus four overlapping quarters,
# so a small defect in one corner is not drowned out by the rest of the scene.
TILES: List[Tuple[float, float, float, float]] = [
    (0.0, 0.0, 1.0, 1.0),
    (0.0, 0.0, 0.6, 0.6), (0.4, 0.0, 0.6, 0.6),
    (0.0, 0.4, 0.6, 0.6), (0.4, 0.4, 0.6, 0.6),
]


class Detector:
    def __init__(self):
        self.status = "not_loaded"  # not_loaded | loading | ready | failed
        self.error: Optional[str] = None
        self.device = "cpu"
        # Set to False to run without the fine-tuned models (used to measure what they add).
        self.use_trained = True
        self._lock = threading.Lock()
        self._clf = self._clf_proc = self._det = self._det_proc = None
        self._sam = self._sam_proc = None
        self._trained: Dict[str, Tuple[Trained, Any]] = {}  # issue type -> (settings, model)
        self._text: Optional[torch.Tensor] = None
        self._pos: Dict[str, List[int]] = {}
        self._neg: Dict[str, List[int]] = {}

    # ------------------------------------------------------------------ #
    # Loading
    # ------------------------------------------------------------------ #

    def load(self):
        """Loads the models (blocking). The first run downloads the weights."""
        with self._lock:
            if self.status == "ready":
                return
            self.status = "loading"
            try:
                from transformers import AutoModel, AutoModelForZeroShotObjectDetection, AutoProcessor, Sam2Model, Sam2Processor

                want = settings.DEVICE
                self.device = "cuda" if (want == "auto" and torch.cuda.is_available()) else ("cpu" if want == "auto" else want)
                logger.info("Loading vision models on %s ...", self.device)

                self._clf_proc = AutoProcessor.from_pretrained(settings.CLASSIFIER_MODEL)
                self._clf = AutoModel.from_pretrained(settings.CLASSIFIER_MODEL).to(self.device).eval()
                self._embed_taxonomy()
                # The sentences are encoded once; only the image half of the classifier is needed from here on.
                self._clf.text_model = None
                if self.device == "cuda":
                    self._clf = self._clf.half()
                    torch.cuda.empty_cache()

                self._det_proc = AutoProcessor.from_pretrained(settings.DETECTOR_MODEL)
                self._det = AutoModelForZeroShotObjectDetection.from_pretrained(settings.DETECTOR_MODEL).to(self.device).eval()

                self._sam_proc = Sam2Processor.from_pretrained(settings.SEGMENTER_MODEL)
                self._sam = Sam2Model.from_pretrained(settings.SEGMENTER_MODEL).to(self.device).eval()

                self._load_trained()
                self.status = "ready"
                logger.info("Detector ready (%d issue types, fine-tuned models for: %s).",
                            len(taxonomy.ISSUE_TYPES), ", ".join(self._trained) or "none")
            except Exception as e:  # surfaced through /api/health
                self.status = "failed"
                self.error = str(e)
                logger.exception("Detector failed to load")
                raise

    def _load_trained(self):
        """Fine-tuned models are optional: an issue without one is found zero-shot like everything else."""
        for spec in TRAINED:
            path = settings.MODELS_PATH / spec.file
            if not path.exists():
                logger.info("No fine-tuned model for %s at %s (training/train.py creates one).", spec.issue_type, path)
                continue
            try:
                from ultralytics import YOLO
                from ultralytics.utils import SETTINGS

                # Ultralytics reports anonymous usage by default. Switched off in memory only,
                # so nothing leaves the machine and its machine-wide settings file stays untouched.
                dict.__setitem__(SETTINGS, "sync", False)
                self._trained[spec.issue_type] = (spec, YOLO(str(path)))
            except Exception as e:
                logger.warning("Could not load %s (%s); %s will be found zero-shot.", path.name, e, spec.issue_type)

    def _active(self) -> Dict[str, Tuple[Trained, Any]]:
        return self._trained if self.use_trained else {}

    def describe(self) -> Dict[str, Any]:
        """Which models produced a result (stored with every incident)."""
        return {
            "device": self.device,
            "models": {
                "fine_tuned": {issue: spec.file for issue, (spec, _) in self._active().items()},
                "classifier": settings.CLASSIFIER_MODEL,
                "box_detector": settings.DETECTOR_MODEL,
                "segmenter": settings.SEGMENTER_MODEL,
            },
        }

    @torch.no_grad()
    def _embed_taxonomy(self):
        """Encodes every taxonomy sentence once; pictures are compared against these."""
        texts: List[str] = []
        normal = list(range(len(taxonomy.NORMAL_SCENES)))
        texts += taxonomy.NORMAL_SCENES
        for issue in taxonomy.ISSUE_TYPES:
            self._pos[issue.id] = list(range(len(texts), len(texts) + len(issue.scene_prompts)))
            texts += issue.scene_prompts
            self._neg[issue.id] = normal + list(range(len(texts), len(texts) + len(issue.lookalikes)))
            texts += issue.lookalikes
        inputs = self._clf_proc(text=texts, padding="max_length", max_length=64, return_tensors="pt").to(self.device)
        feats = _features(self._clf.get_text_features(**inputs))
        self._text = torch.nn.functional.normalize(feats, dim=-1)

    # ------------------------------------------------------------------ #
    # Classifier helpers
    # ------------------------------------------------------------------ #

    @torch.no_grad()
    def _classify(self, images: List[Image.Image]) -> torch.Tensor:
        """Probability of every taxonomy sentence for each image: (images, sentences)."""
        inputs = self._clf_proc(images=images, return_tensors="pt").to(self.device)
        pixels = inputs["pixel_values"].to(self._clf.dtype)
        feats = torch.nn.functional.normalize(_features(self._clf.get_image_features(pixel_values=pixels)).float(), dim=-1)
        logits = feats @ self._text.T * self._clf.logit_scale.exp().float() + self._clf.logit_bias.float()
        return logits.sigmoid().cpu()

    def _issue_scores(self, probs: torch.Tensor, issue_id: str) -> Tuple[torch.Tensor, torch.Tensor]:
        """Per image: how strongly it shows the issue, and how strongly it shows something harmless."""
        return probs[:, self._pos[issue_id]].max(dim=1).values, probs[:, self._neg[issue_id]].max(dim=1).values

    # ------------------------------------------------------------------ #
    # Detection
    # ------------------------------------------------------------------ #

    def detect(self, image: Image.Image) -> List[Box]:
        """Returns the irregularities found in one RGB image, strongest first, each with its outline."""
        if self.status != "ready":
            self.load()
        with self._lock:
            present, evidence = self._what(image)
            trained = self._active()
            found_by_trained: List[Box] = []
            if max(evidence["pothole"], evidence["road_crack"]) >= ROAD_DAMAGE_MIN:
                for issue_id, (spec, model) in trained.items():
                    sure = evidence[issue_id] >= SCENE_SURE
                    found_by_trained += self._run_trained(model, spec, image, spec.min_confidence_sure if sure else spec.min_confidence)
            if not present and not found_by_trained:
                return []

            # Issues with a trained model belong to it; the zero-shot detector looks for everything else.
            # (On the test photos, zero-shot pothole boxes added false alarms and no correct ones.)
            zero_shot = [i for i in present if i not in trained]
            candidates = self._check(image, self._where(image, zero_shot), list(present)) if zero_shot else []
            # Where both found the same object, the trained model's answer stands.
            boxes = found_by_trained + [b for b in candidates if not any(iou(b, k) > 0.6 for k in found_by_trained)]

            # Clearly recognised but not boxed: report it over the region it was seen in.
            found = {b.issue_type for b in boxes}
            for issue_id, (score, tile) in present.items():
                # A trained model looked for it and found none: only a very sure classifier overrides that.
                needed = SCENE_SURE if issue_id in trained else PRESENT_SURE
                if issue_id not in found and score >= needed and not taxonomy.BY_ID[issue_id].box_required:
                    boxes.append(Box(issue_id, score, *tile, coarse=True, scores={"classify": round(score, 3)}))

            self._outline(image, boxes)
        return sorted(boxes, key=lambda b: b.confidence, reverse=True)

    def _run_trained(self, model, spec: Trained, image: Image.Image, min_confidence: float) -> List[Box]:
        """Detections from a fine-tuned model. They come with their own outlines."""
        result = model.predict(image, conf=min_confidence, imgsz=640, device=0 if self.device == "cuda" else "cpu", verbose=False)[0]
        outlines = result.masks.xyn if result.masks is not None else []
        boxes = []
        for i, ((x1, y1, x2, y2), conf) in enumerate(zip(result.boxes.xyxyn.tolist(), result.boxes.conf.tolist())):
            outline = _simplify(np.asarray(outlines[i], dtype=np.float32)) if i < len(outlines) else None
            box = Box(spec.issue_type, round(float(conf), 3), x1, y1, x2 - x1, y2 - y1,
                      scores={"trained": round(float(conf), 3)}, mask=outline, model=spec.name)
            if box.w > 0.01 and box.h > 0.01:
                boxes.append(box)
        return boxes

    def _what(self, image: Image.Image):
        """
        Stage 1 — which issues are in the picture.
        Returns ({issue id: (probability, region it was seen in)} for the issues that are present,
                 {issue id: probability} for every issue, present or not).
        """
        W, H = image.size
        tiles = TILES if min(W, H) >= 320 else TILES[:1]
        crops = [image.crop((int(x * W), int(y * H), int((x + w) * W), int((y + h) * H))) for x, y, w, h in tiles]
        probs = self._classify(crops)
        present, evidence = {}, {}
        for issue in taxonomy.ISSUE_TYPES:
            pos, neg = self._issue_scores(probs, issue.id)
            best = int(pos.argmax())
            evidence[issue.id] = float(pos[best])
            if pos[best] >= issue.min_score and pos[best] > neg[best]:
                present[issue.id] = (float(pos[best]), tiles[best])
        for a, b in EITHER_OR:
            if a in present and b in present:
                del present[a if present[a][0] < present[b][0] else b]
        for a, b in SUBSUMES:
            if a in present:
                present.pop(b, None)
        return present, evidence

    @torch.no_grad()
    def _where(self, image: Image.Image, issue_ids: List[str]) -> List[Box]:
        """Stage 2 — boxes for the given issues."""
        phrases = [(p, issue_id) for issue_id in issue_ids for p in taxonomy.BY_ID[issue_id].locate_prompts]
        spans, text = [], ""
        for phrase, _ in phrases:
            spans.append((len(text), len(text) + len(phrase)))
            text += phrase + " . "
        text = text.strip()

        offsets = self._det_proc.tokenizer(text, return_offsets_mapping=True)["offset_mapping"]
        phrase_tokens = [[i for i, (s, e) in enumerate(offsets) if e > s and s >= ps and e <= pe] for ps, pe in spans]

        inputs = self._det_proc(images=image, text=text, return_tensors="pt").to(self.device)
        outputs = self._det(**inputs)
        probs = outputs.logits[0].sigmoid()  # (queries, text tokens)
        raw = outputs.pred_boxes[0]  # (queries, 4) as cx, cy, w, h fractions

        # Score each candidate box against each phrase (mean over the phrase's tokens,
        # so "fallen tree" needs both words to match, not just "tree").
        phrase_scores = torch.stack([probs[:, toks].mean(dim=1) for toks in phrase_tokens], dim=1)
        score, which = phrase_scores.max(dim=1)
        keep = score >= BOX_MIN
        raw, score, which = raw[keep], score[keep], which[keep]
        if raw.numel() == 0:
            return []

        xyxy = torch.stack(
            [raw[:, 0] - raw[:, 2] / 2, raw[:, 1] - raw[:, 3] / 2, raw[:, 0] + raw[:, 2] / 2, raw[:, 1] + raw[:, 3] / 2], dim=1
        ).clamp(0, 1)
        kept = nms(xyxy, score, iou_threshold=0.5)[:40]  # one box per physical object

        boxes = []
        for (x1, y1, x2, y2), s, pi in zip(xyxy[kept].tolist(), score[kept].tolist(), which[kept].tolist()):
            issue_id = phrases[pi][1]
            box = Box(issue_id, float(s), x1, y1, x2 - x1, y2 - y1, scores={"locate": round(float(s), 3)})
            if box.w > 0.01 and box.h > 0.01 and box.area <= taxonomy.BY_ID[issue_id].max_area:
                boxes.append(box)
        return _drop_nested(boxes)

    def _check(self, image: Image.Image, boxes: List[Box], present: List[str]) -> List[Box]:
        """
        Stage 3 — looks at each box on its own and keeps it only if its contents really show
        one of the issues found in stage 1. The classifier has the final say on the label.
        """
        if not boxes:
            return []
        W, H = image.size
        crops = []
        for b in boxes:
            px, py = b.w * 0.25, b.h * 0.25  # some surrounding context helps the classifier
            crops.append(image.crop((int(max(0, b.x - px) * W), int(max(0, b.y - py) * H),
                                     int(min(1, b.x + b.w + px) * W), int(min(1, b.y + b.h + py) * H))))
        probs = self._classify(crops)
        proposed = [b.issue_type for b in boxes]
        scores = {issue_id: self._issue_scores(probs, issue_id) for issue_id in present}

        out = []
        for i, b in enumerate(boxes):
            best, best_p = None, 0.0
            for issue_id, (pos, neg) in scores.items():
                p = float(pos[i])
                if p < CROP_MIN or p <= float(neg[i]) or b.area > taxonomy.BY_ID[issue_id].max_area:
                    continue
                # Stay with the detector's own label unless another issue is clearly a better fit.
                rank = p + (0.15 if issue_id == proposed[i] else 0.0)
                if rank > best_p:
                    best, best_p, kept_p = issue_id, rank, p
            if best is None:
                continue
            b.issue_type = best
            b.scores["classify"] = round(kept_p, 3)
            b.confidence = round((b.scores["locate"] + kept_p) / 2, 3)
            out.append(b)
        return _drop_nested(out)

    @torch.no_grad()
    def _outline(self, image: Image.Image, boxes: List[Box]):
        """Turns each box into the outline of the object inside it (boxes that already have one are left alone)."""
        todo = [b for b in boxes if b.mask is None and not b.coarse]
        if not todo:
            return
        # The segmenter works at 1024 px anyway; shrinking first keeps large photos fast.
        W, H = image.size
        scale = min(1.0, 1024 / max(W, H))
        small = image if scale == 1.0 else image.resize((max(1, round(W * scale)), max(1, round(H * scale))))
        w, h = small.size
        prompts = [[[b.x * w, b.y * h, (b.x + b.w) * w, (b.y + b.h) * h] for b in todo]]
        inputs = self._sam_proc(images=small, input_boxes=prompts, return_tensors="pt").to(self.device)
        outputs = self._sam(**inputs, multimask_output=False)
        masks = self._sam_proc.post_process_masks(outputs.pred_masks.cpu(), inputs["original_sizes"])[0]  # (boxes, 1, h, w)
        for box, mask in zip(todo, masks[:, 0].numpy()):
            box.mask = _polygon(mask, box)


def _features(out) -> torch.Tensor:
    return out.pooler_output if hasattr(out, "pooler_output") else out


def _polygon(mask: np.ndarray, box: Box) -> Optional[List[List[float]]]:
    """The largest connected region of a mask as a simplified polygon in 0-1 frame coordinates."""
    h, w = mask.shape
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    # An outline that covers almost none of its box is noise, not the object.
    if cv2.contourArea(contour) < 0.08 * box.area * w * h:
        return None
    return _simplify(contour.reshape(-1, 2).astype(np.float32) / [w, h])


def _simplify(points: np.ndarray, max_points: int = 60) -> Optional[List[List[float]]]:
    """Reduces an outline to a manageable number of points without visibly changing its shape."""
    if points is None or len(points) < 3:
        return None
    contour = (points * 10000).astype(np.float32).reshape(-1, 1, 2)
    epsilon = 0.002 * cv2.arcLength(contour, True)
    simple = cv2.approxPolyDP(contour, epsilon, True)
    while len(simple) > max_points:
        epsilon *= 1.5
        simple = cv2.approxPolyDP(contour, epsilon, True)
    if len(simple) < 3:
        return None
    return [[round(float(x) / 10000, 4), round(float(y) / 10000, 4)] for x, y in simple.reshape(-1, 2)]


def _drop_nested(boxes: List[Box]) -> List[Box]:
    """Removes a box that mostly sits inside a stronger box of the same issue type."""
    boxes = sorted(boxes, key=lambda b: b.confidence, reverse=True)
    out: List[Box] = []
    for b in boxes:
        nested = False
        for k in out:
            if k.issue_type != b.issue_type:
                continue
            ix = max(0.0, min(b.x + b.w, k.x + k.w) - max(b.x, k.x))
            iy = max(0.0, min(b.y + b.h, k.y + k.h) - max(b.y, k.y))
            if (ix * iy) / min(b.area, k.area) > 0.8:
                nested = True
                break
        if not nested:
            out.append(b)
    return out


detector = Detector()
