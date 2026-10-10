"""
Turns a written complaint into structured issues: what is wrong, how bad, and where.

Each sentence is matched against the taxonomy keywords first (precise), and
falls back to semantic similarity with the issue descriptions (flexible).
"""
import re
from dataclasses import dataclass
from typing import List, Optional

import numpy as np

from app import taxonomy
from app.services.embedder import embedder

# Below this similarity a sentence is not considered to describe any known issue.
SEMANTIC_THRESHOLD = 0.5

SEVERE_CUES = [
    "accident", "injur", "died", "death", "fell", "fallen into", "dangerous", "danger", "hazard", "emergency",
    "urgent", "immediately", "live wire", "sparking", "electrocut", "children", "school", "hospital", "ambulance",
    "completely blocked", "fully blocked", "entire road", "entering houses", "entering homes", "collapsed",
]
HIGH_CUES = ["deep", "huge", "large", "big", "major", "severe", "serious", "badly", "many", "several", "day", "week", "month", "again", "repeated", "overflowing"]
LOW_CUES = ["small", "minor", "slight", "little", "tiny"]

LOCATION_PATTERN = re.compile(
    r"\b(?:near|at|outside|opposite|beside|behind|in front of|next to|along|on)\s+"
    r"((?:the\s+)?[A-Z0-9][\w'’.-]*(?:\s+(?:of|the|and|&)?\s*[A-Z0-9][\w'’.-]*){0,5})"
)


@dataclass
class TextIssue:
    issue_type: str
    confidence: float
    severity: int
    evidence: str  # the sentence that mentions the issue
    matched: str  # the keyword that matched, or "semantic match"


def _sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", text.strip())
    return [p.strip() for p in parts if len(p.strip()) > 2]


def _keyword_hit(sentence: str, keyword: str) -> bool:
    return re.search(r"(?<![a-z])" + re.escape(keyword) + r"(?![a-z])", sentence) is not None


def _severity(issue: taxonomy.IssueType, text: str) -> int:
    """How urgent the wording makes it sound, shifted by how dangerous the issue type is."""
    low = text.lower()
    level = 3
    if any(c in low for c in SEVERE_CUES):
        level = 5
    elif any(re.search(r"" + c, low) for c in HIGH_CUES):
        level = 4
    elif any(re.search(r"" + c + r"", low) for c in LOW_CUES):
        level = 2
    return max(1, min(5, level + issue.hazard - 1))


def extract_location(text: str) -> Optional[str]:
    """Pulls a place name out of phrases like 'near Gandhi Market' (best effort)."""
    m = LOCATION_PATTERN.search(text)
    if not m:
        return None
    place = m.group(1).strip(" .,")
    return place if len(place) >= 3 else None


def analyze_text(text: str) -> List[TextIssue]:
    sentences = _sentences(text) or [text.strip()]
    found: dict[str, TextIssue] = {}

    # 1. Keyword matches — longest keyword wins so "street light" beats "light".
    for sentence in sentences:
        low = sentence.lower()
        for issue in taxonomy.ISSUE_TYPES:
            hits = [k for k in issue.keywords if _keyword_hit(low, k)]
            if not hits:
                continue
            best = max(hits, key=len)
            confidence = min(0.95, 0.70 + 0.05 * len(hits) + 0.01 * len(best))
            current = found.get(issue.id)
            if current is None or confidence > current.confidence:
                found[issue.id] = TextIssue(issue.id, round(confidence, 2), _severity(issue, sentence), sentence, best)

    # A fallen tree is the obstruction; do not report it twice.
    if "fallen_tree" in found:
        found.pop("road_obstruction", None)

    # 2. Semantic fallback for sentences phrased without any of our keywords:
    #    compare each sentence with how people usually describe each issue.
    if not found:
        refs = [(t, text) for t in taxonomy.ISSUE_TYPES for text in [f"{t.label}. {t.description}", *t.examples]]
        vectors = embedder.embed(sentences + [text for _, text in refs])
        sims = vectors[: len(sentences)] @ vectors[len(sentences):].T
        si, ri = np.unravel_index(int(np.argmax(sims)), sims.shape)
        score = float(sims[si, ri])
        if score >= SEMANTIC_THRESHOLD:
            issue = refs[ri][0]
            found[issue.id] = TextIssue(issue.id, round(min(0.9, score), 2), _severity(issue, sentences[si]), sentences[si], "semantic match")

    # 3. Still nothing: keep the report, flagged for a human to classify.
    if not found:
        found["other"] = TextIssue("other", 0.3, _severity(taxonomy.OTHER, text), sentences[0], "unclassified")

    # With a single issue the whole report is about it, so urgency anywhere in the text counts.
    # With several, each is judged by its own sentence ("two scooters fell" is about the pothole, not the lamp).
    if len(found) == 1:
        only = next(iter(found.values()))
        only.severity = _severity(taxonomy.BY_ID[only.issue_type], text)

    return sorted(found.values(), key=lambda i: (i.severity, i.confidence), reverse=True)
