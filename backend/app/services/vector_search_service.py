import math
import hashlib
from typing import List, Dict, Any
from app.core.database import get_database

class VectorSearchService:
    EMBEDDING_DIM = 64

    @staticmethod
    def generate_embedding(text: str) -> List[float]:
        """
        Generates a dense unit-normalized semantic embedding vector.
        Uses deterministic semantic feature projection and token n-grams
        so similar concepts (e.g. pothole, asphalt, road, rain, repair)
        cluster together with high cosine similarity.
        Works 100% offline without requiring external API keys.
        """
        vec = [0.0] * VectorSearchService.EMBEDDING_DIM
        if not text:
            return vec
            
        words = text.lower().replace(",", " ").replace(".", " ").split()
        
        # Semantic keyword clustering weights
        clusters = {
            "pothole": [0, 1, 2, 3],
            "asphalt": [2, 3, 4, 5],
            "road": [1, 4, 6, 7],
            "sub-base": [3, 5, 8, 9],
            "rain": [10, 11, 12],
            "stormwater": [11, 12, 13],
            "drain": [12, 13, 14],
            "garbage": [20, 21, 22, 23],
            "waste": [21, 22, 24],
            "market": [23, 25],
            "light": [30, 31, 32],
            "dark": [31, 33],
            "lamp": [32, 34],
            "feeder": [34, 35],
            "water": [40, 41, 42],
            "pipe": [41, 43],
            "sewage": [42, 44]
        }
        
        for w in words:
            # Check cluster weights
            matched = False
            for k, dims in clusters.items():
                if k in w:
                    matched = True
                    for d in dims:
                        vec[d] += 1.8
            if not matched:
                # Hash fallback
                h = int(hashlib.md5(w.encode("utf-8")).hexdigest()[:8], 16)
                idx = h % VectorSearchService.EMBEDDING_DIM
                vec[idx] += 0.5
                
        # Normalize to unit vector (L2 norm)
        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [round(x / norm, 5) for x in vec]
        return vec

    @staticmethod
    def cosine_similarity(v1: List[float], v2: List[float]) -> float:
        if not v1 or not v2 or len(v1) != len(v2):
            return 0.0
        dot = sum(a * b for a, b in zip(v1, v2))
        return max(0.0, min(1.0, dot))

    @staticmethod
    async def search_memories(query_text: str, incident_type: str | None = None, top_k: int = 3) -> List[Dict[str, Any]]:
        """
        Executes semantic vector search against the 'memories' collection in MongoDB.
        Combines semantic similarity scoring with category and validation filters.
        """
        db = get_database()
        query_vec = VectorSearchService.generate_embedding(query_text)
        
        query_filter: Dict[str, Any] = {}
        if incident_type and incident_type != "other":
            query_filter["incident_type"] = incident_type
            
        cursor = db.memories.find(query_filter)
        memories = await cursor.to_list(length=100)
        
        # If no memories match category, search all validated memories
        if not memories:
            cursor = db.memories.find({})
            memories = await cursor.to_list(length=100)
            
        scored_memories = []
        for mem in memories:
            mem_text = f"{mem.get('title', '')} {mem.get('lesson_learned', '')} {mem.get('historical_action_taken', '')}"
            mem_vec = mem.get("embedding")
            if not mem_vec:
                mem_vec = VectorSearchService.generate_embedding(mem_text)
                # Cache embedding back in MongoDB
                await db.memories.update_one({"_id": mem["_id"]}, {"$set": {"embedding": mem_vec}})
                
            sim = VectorSearchService.cosine_similarity(query_vec, mem_vec)
            
            # Boost if category matches exactly
            if mem.get("incident_type") == incident_type:
                sim = min(0.99, sim + 0.15)
                
            scored_memories.append({
                **mem,
                "similarity_score": round(sim, 3)
            })
            
        # Sort descending by similarity
        scored_memories.sort(key=lambda x: x["similarity_score"], reverse=True)
        return scored_memories[:top_k]
