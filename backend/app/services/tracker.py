"""
Follows each irregularity across video frames, so a pothole that is visible
for three seconds is stored as one detection — not one per frame.

The camera is usually moving (a phone, a dashcam), so between frames the
tracker first estimates how the whole picture shifted and moves every known
box along with it before looking for a match.
"""
from dataclasses import dataclass, field, replace
from typing import List, Optional

import cv2
import numpy as np

from app.services.detector import Box, iou

MIN_IOU = 0.2


@dataclass
class Track:
    id: int
    points: List[tuple] = field(default_factory=list)  # (time_s, Box)
    # Where the object should be in the current frame, given how the camera has moved.
    predicted: Optional[Box] = None

    @property
    def issue_type(self) -> str:
        return self.points[0][1].issue_type

    @property
    def last_time(self) -> float:
        return self.points[-1][0]

    @property
    def first_time(self) -> float:
        return self.points[0][0]

    @property
    def best(self) -> tuple:
        """The frame where the detector was most confident."""
        return max(self.points, key=lambda p: p[1].confidence)

    @property
    def confidence(self) -> float:
        return self.best[1].confidence


class CameraMotion:
    """Estimates how the picture moved between two consecutive analysed frames."""

    def __init__(self):
        self._orb = cv2.ORB_create(nfeatures=800)
        self._matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        self._prev = None  # (keypoints, descriptors)
        self._size = (1, 1)

    def update(self, frame_bgr: np.ndarray) -> Optional[np.ndarray]:
        """Returns a 2x3 matrix mapping the previous frame onto this one (in pixels of a small copy), or None."""
        h, w = frame_bgr.shape[:2]
        scale = 480 / max(h, w)
        gray = cv2.cvtColor(cv2.resize(frame_bgr, (int(w * scale), int(h * scale))), cv2.COLOR_BGR2GRAY)
        self._size = (gray.shape[1], gray.shape[0])
        current = self._orb.detectAndCompute(gray, None)
        previous, self._prev = self._prev, current
        if previous is None or previous[1] is None or current[1] is None:
            return None
        matches = self._matcher.match(previous[1], current[1])
        if len(matches) < 25:
            return None
        src = np.float32([previous[0][m.queryIdx].pt for m in matches])
        dst = np.float32([current[0][m.trainIdx].pt for m in matches])
        matrix, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=4)
        # Too few agreeing points means a scene cut or a blur: do not guess.
        if matrix is None or inliers is None or int(inliers.sum()) < 20:
            return None
        return matrix

    def move(self, box: Box, matrix: np.ndarray) -> Box:
        """Where `box` from the previous frame lands in the current one."""
        w, h = self._size
        corners = np.float32([[box.x * w, box.y * h], [(box.x + box.w) * w, box.y * h],
                              [box.x * w, (box.y + box.h) * h], [(box.x + box.w) * w, (box.y + box.h) * h]])
        moved = corners @ matrix[:, :2].T + matrix[:, 2]
        x1, y1 = moved[:, 0].min() / w, moved[:, 1].min() / h
        x2, y2 = moved[:, 0].max() / w, moved[:, 1].max() / h
        return replace(box, x=float(x1), y=float(y1), w=float(x2 - x1), h=float(y2 - y1))


class Tracker:
    def __init__(self, max_gap_s: float = 1.0):
        # A track that goes unseen for longer than this is closed.
        self.max_gap_s = max_gap_s
        self.tracks: List[Track] = []
        self.frames = 0
        self._next_id = 1
        self._camera = CameraMotion()

    def update(self, time_s: float, frame_bgr: np.ndarray, boxes: List[Box]) -> List[tuple]:
        """Matches this frame's boxes to existing tracks. Returns [(track, box)]."""
        self.frames += 1
        motion = self._camera.update(frame_bgr)
        active = [t for t in self.tracks if time_s - t.last_time <= self.max_gap_s]
        if motion is not None:
            for t in active:
                if not t.predicted.coarse:  # a coarse box is a fixed region of the frame, not an object
                    t.predicted = self._camera.move(t.predicted, motion)

        candidates = sorted(
            ((_match_score(t.predicted, b), ti, bi) for ti, t in enumerate(active) for bi, b in enumerate(boxes)),
            reverse=True,
        )
        assigned: dict[int, Track] = {}
        used_tracks = set()
        for score, ti, bi in candidates:
            if score < MIN_IOU or ti in used_tracks or bi in assigned:
                continue
            assigned[bi] = active[ti]
            used_tracks.add(ti)

        out = []
        for bi, box in enumerate(boxes):
            track = assigned.get(bi)
            if track is None:
                track = Track(self._next_id)
                self._next_id += 1
                self.tracks.append(track)
            track.points.append((time_s, box))
            track.predicted = box
            out.append((track, box))
        return out

    def confirmed(self) -> List[Track]:
        """Tracks worth saving. In a real clip, something seen in a single frame is treated as a flicker."""
        need = 2 if self.frames >= 6 else 1
        solid = [t for t in self.tracks if len(t.points) >= need]
        # A roughly located issue adds nothing once the same issue has been boxed properly.
        boxed = {t.issue_type for t in solid if not t.best[1].coarse}
        return [t for t in solid if not (t.best[1].coarse and t.issue_type in boxed)]


def _match_score(a: Box, b: Box) -> float:
    """How well a new box continues a track: same issue, overlapping where the track is expected to be."""
    if a.issue_type != b.issue_type or a.coarse != b.coarse:
        return 0.0
    overlap = iou(a, b)
    if overlap == 0:
        # No overlap: still accept a near neighbour of similar size (motion estimate was off).
        dx = (a.x + a.w / 2) - (b.x + b.w / 2)
        dy = (a.y + a.h / 2) - (b.y + b.h / 2)
        dist = (dx * dx + dy * dy) ** 0.5
        size = max(a.w, a.h, b.w, b.h)
        ratio = min(a.area, b.area) / max(a.area, b.area) if max(a.area, b.area) > 0 else 0
        if dist < size * 0.6 and ratio > 0.4:
            overlap = MIN_IOU
    return overlap
