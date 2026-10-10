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
        return self.model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)

    def embed_one(self, text: str) -> List[float]:
        return [round(float(x), 6) for x in self.embed([text])[0]]


embedder = Embedder()


def cosine(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return float(np.dot(np.asarray(a), np.asarray(b)))
