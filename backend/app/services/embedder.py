"""Sentence embeddings, used to link reports with city memory and to classify free text."""
import logging
import threading
from typing import List

import numpy as np

from app.core.config import settings

logger = logging.getLogger("urbanhp.embedder")


class Embedder:
    def __init__(self):
        self.model = None
        self._lock = threading.Lock()
        # Text -> vector. Retrieval compares a new report with the same past texts again and again.
        self._cache: dict[str, np.ndarray] = {}

    def load(self):
        with self._lock:
            if self.model is None:
                from sentence_transformers import SentenceTransformer

                logger.info("Loading embedding model %s ...", settings.EMBEDDING_MODEL)
                # Small model: kept on the CPU so the GPU stays free for the detector.
                self.model = SentenceTransformer(settings.EMBEDDING_MODEL, device="cpu")

    def embed(self, texts: List[str]) -> np.ndarray:
        """Unit-length vectors, so a dot product is the cosine similarity."""
        if self.model is None:
            self.load()
        return self.model.encode(texts, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)

    def embed_cached(self, texts: List[str]) -> np.ndarray:
        """Like `embed`, but each distinct text is only ever encoded once."""
        missing = list(dict.fromkeys(t for t in texts if t not in self._cache))
        if missing:
            if len(self._cache) + len(missing) > 5000:
                self._cache.clear()
            for text, vector in zip(missing, self.embed(missing)):
                self._cache[text] = vector
        return np.stack([self._cache[t] for t in texts])

    def embed_one(self, text: str) -> List[float]:
        return [round(float(x), 6) for x in self.embed([text])[0]]


embedder = Embedder()


def cosine(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return float(np.dot(np.asarray(a), np.asarray(b)))
