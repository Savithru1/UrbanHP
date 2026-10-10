import uuid
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

from app.core.database import get_database
from app.core.events import broadcaster
from app.services.ai_vision_service import VisionService
from app.services.ai_audio_service import AudioService
from app.services.ai_video_service import VideoService
from app.services.vector_search_service import VectorSearchService
from app.services.recommendation_service import RecommendationService

class IngestionService:
    @staticmethod
    async def process_text_input(text: str, location: str = "Ward 4, Sector 7") -> Dict[str, Any]:
        """
        Processes a written civic complaint report through progressive MongoDB updates.
        """
        db = get_database()
        incident_id = f"inc_{datetime.utcnow().strftime('%Y%m%d')}_{uuid.uuid4().hex[:6]}"
        now = datetime.utcnow()
        
        # STAGE 1: Received
        stages = [{"stage": "received", "timestamp": now.isoformat(), "detail": "Text complaint recorded in MongoDB"}]
        incident_doc = {
            "_id": incident_id,
            "input_type": "text",
            "incident_type": "other",
            "processing_status": "received",
            "verification_status": "pending_review",
            "severity": "medium",
            "raw_content": text,
            "extracted_text": None,
            "location": location,
            "confidence_score": 0.50,
            "original_file_id": None,
            "file_url": None,
            "evidence_summary": {},
            "related_memory_ids": [],
            "recommendation": None,
            "reasoning_trace": None,
            "version": 1,
            "processing_stages": stages,
            "created_at": now,
            "updated_at": now
        }
        await db.incidents.insert_one(incident_doc)
        await broadcaster.broadcast("incident_update", incident_doc)
        await asyncio.sleep(0.4) # observable micro-delay for live dashboard & Compass demo
        
        # STAGE 2: AI Extraction & Text Cleaning
        category = "pothole"
        text_lower = text.lower()
        if any(w in text_lower for w in ["pothole", "crater", "hole", "road", "asphalt", "bump"]):
            category = "pothole"
        elif any(w in text_lower for w in ["garbage", "trash", "waste", "dump", "bin", "smell"]):
            category = "garbage"
        elif any(w in text_lower for w in ["light", "dark", "lamp", "pole", "bulb"]):
            category = "street_light"
        elif any(w in text_lower for w in ["water", "flood", "drain", "gutter", "clog"]):
            category = "drainage"
            
        severity = "high" if any(w in text_lower for w in ["deep", "dangerous", "accident", "hazard", "overflow", "severe"]) else "medium"
        extracted_text = f"Normalized Citizen Report: '{text.strip()}' [Extracted Incident Focus: {category.upper()}]"
        
        stages.append({"stage": "extracted", "timestamp": datetime.utcnow().isoformat(), "detail": f"NLP Classification completed: {category}"})
        await db.incidents.update_one(
            {"_id": incident_id},
            {"$set": {
                "incident_type": category,
                "severity": severity,
                "extracted_text": extracted_text,
                "processing_status": "extracted",
                "confidence_score": 0.92,
                "version": 2,
                "processing_stages": stages,
                "updated_at": datetime.utcnow()
            }}
        )
        updated = await db.incidents.find_one({"_id": incident_id})
        await broadcaster.broadcast("incident_update", updated)
        await asyncio.sleep(0.5)
        
        # STAGE 3: Memory Vector Search
        stages.append({"stage": "memory_linked", "timestamp": datetime.utcnow().isoformat(), "detail": "Retrieved semantic historical memories from MongoDB"})
        matched_memories = await VectorSearchService.search_memories(text, incident_type=category, top_k=2)
        memory_ids = [m["_id"] for m in matched_memories]
        
        await db.incidents.update_one(
            {"_id": incident_id},
            {"$set": {
                "related_memory_ids": memory_ids,
                "processing_status": "memory_linked",
                "version": 3,
                "processing_stages": stages,
                "updated_at": datetime.utcnow()
            }}
        )
        updated = await db.incidents.find_one({"_id": incident_id})
        await broadcaster.broadcast("incident_update", updated)
        await asyncio.sleep(0.5)
        
        # STAGE 4: Final Recommendation
        recommendation, reasoning = RecommendationService.generate_recommendation(
            incident_type=category,
            extracted_text=extracted_text,
            severity=severity,
            evidence_summary={"text_length": len(text)},
            matched_memories=matched_memories
        )
        stages.append({"stage": "completed", "timestamp": datetime.utcnow().isoformat(), "detail": "Recommendation formulated from city memory"})
        
        await db.incidents.update_one(
            {"_id": incident_id},
            {"$set": {
                "recommendation": recommendation,
                "reasoning_trace": reasoning,
                "processing_status": "completed",
                "version": 4,
                "processing_stages": stages,
                "updated_at": datetime.utcnow()
            }}
        )
        final_doc = await db.incidents.find_one({"_id": incident_id})
        await broadcaster.broadcast("incident_update", final_doc)
        return final_doc

    @staticmethod
    async def process_media_upload(
        input_type: str,
        file_path: Path,
        file_url: str,
        original_filename: str,
        location: str = "Ward 4, Sector 7"
    ) -> Dict[str, Any]:
        """
        Processes Image, Video, or Audio file through progressive MongoDB stage updates.
        """
        db = get_database()
        incident_id = f"inc_{datetime.utcnow().strftime('%Y%m%d')}_{uuid.uuid4().hex[:6]}"
        media_id = f"med_{uuid.uuid4().hex[:8]}"
        now = datetime.utcnow()
        file_size = file_path.stat().st_size
        
        # Record media asset in media_assets collection
        media_doc = {
            "_id": media_id,
            "incident_id": incident_id,
            "file_name": original_filename,
            "file_type": input_type,
            "file_size_bytes": file_size,
            "storage_path": str(file_path),
            "url": file_url,
            "metadata": {},
            "created_at": now
        }
        await db.media_assets.insert_one(media_doc)
        
        # STAGE 1: Received
        stages = [{"stage": "received", "timestamp": now.isoformat(), "detail": f"Uploaded {input_type} asset registered in MongoDB Compass"}]
        incident_doc = {
            "_id": incident_id,
            "input_type": input_type,
            "incident_type": "other",
            "processing_status": "received",
            "verification_status": "pending_review",
            "severity": "medium",
            "raw_content": f"Uploaded {input_type.capitalize()} evidence: {original_filename}",
            "extracted_text": None,
            "location": location,
            "confidence_score": 0.50,
            "original_file_id": media_id,
            "file_url": file_url,
            "evidence_summary": {"file_size_bytes": file_size},
            "related_memory_ids": [],
            "recommendation": None,
            "reasoning_trace": None,
            "version": 1,
            "processing_stages": stages,
            "created_at": now,
            "updated_at": now
        }
        await db.incidents.insert_one(incident_doc)
        await broadcaster.broadcast("incident_update", incident_doc)
        await asyncio.sleep(0.5)
        
        # STAGE 2: Processing started
        stages.append({"stage": "processing", "timestamp": datetime.utcnow().isoformat(), "detail": f"AI {input_type.upper()} pipeline analyzing evidence features"})
        await db.incidents.update_one(
            {"_id": incident_id},
            {"$set": {
                "processing_status": "processing",
                "version": 2,
                "processing_stages": stages,
                "updated_at": datetime.utcnow()
            }}
        )
        updated = await db.incidents.find_one({"_id": incident_id})
        await broadcaster.broadcast("incident_update", updated)
        
        # STAGE 3: Extract features based on type
        if input_type == "image":
            extraction = VisionService.analyze_image(file_path)
            category = extraction["category"]
            severity = extraction["severity"]
            extracted_text = extraction["extracted_text"]
            confidence = extraction["confidence"]
            evidence_summary = extraction["evidence_summary"]
            
        elif input_type == "video":
            extraction = VideoService.process_video(file_path)
            category = extraction["category"]
            severity = extraction["severity"]
            extracted_text = extraction["extracted_text"]
            confidence = extraction["confidence"]
            evidence_summary = extraction["evidence_summary"]
            evidence_summary["keyframes"] = extraction.get("keyframes", [])
            evidence_summary["peak_timestamp"] = extraction.get("peak_timestamp", "00:04")
            
        elif input_type == "voice":
            extraction = AudioService.analyze_audio(file_path)
            category = extraction["category"]
            severity = extraction["severity"]
            extracted_text = extraction["transcript"]
            confidence = extraction["confidence"]
            evidence_summary = extraction["evidence_summary"]
            
        else:
            category = "pothole"
            severity = "medium"
            extracted_text = "Multimodal civic evidence processed."
            confidence = 0.85
            evidence_summary = {}
            
        stages.append({"stage": "extracted", "timestamp": datetime.utcnow().isoformat(), "detail": f"Information extracted: {category.upper()} with confidence {confidence * 100}%"})
        await db.incidents.update_one(
            {"_id": incident_id},
            {"$set": {
                "incident_type": category,
                "severity": severity,
                "extracted_text": extracted_text,
                "confidence_score": confidence,
                "evidence_summary": evidence_summary,
                "processing_status": "extracted",
                "version": 3,
                "processing_stages": stages,
                "updated_at": datetime.utcnow()
            }}
        )
        updated = await db.incidents.find_one({"_id": incident_id})
        await broadcaster.broadcast("incident_update", updated)
        await asyncio.sleep(0.5)
        
        # STAGE 4: Memory Vector Search
        stages.append({"stage": "memory_linked", "timestamp": datetime.utcnow().isoformat(), "detail": "Retrieved semantic historical memories from MongoDB Compass"})
        matched_memories = await VectorSearchService.search_memories(extracted_text, incident_type=category, top_k=2)
        memory_ids = [m["_id"] for m in matched_memories]
        
        await db.incidents.update_one(
            {"_id": incident_id},
            {"$set": {
                "related_memory_ids": memory_ids,
                "processing_status": "memory_linked",
                "version": 4,
                "processing_stages": stages,
                "updated_at": datetime.utcnow()
            }}
        )
        updated = await db.incidents.find_one({"_id": incident_id})
        await broadcaster.broadcast("incident_update", updated)
        await asyncio.sleep(0.5)
        
        # STAGE 5: Recommendation Formulation
        recommendation, reasoning = RecommendationService.generate_recommendation(
            incident_type=category,
            extracted_text=extracted_text,
            severity=severity,
            evidence_summary=evidence_summary,
            matched_memories=matched_memories
        )
        stages.append({"stage": "completed", "timestamp": datetime.utcnow().isoformat(), "detail": "Incident record finalized and synchronized"})
        
        await db.incidents.update_one(
            {"_id": incident_id},
            {"$set": {
                "recommendation": recommendation,
                "reasoning_trace": reasoning,
                "processing_status": "completed",
                "version": 5,
                "processing_stages": stages,
                "updated_at": datetime.utcnow()
            }}
        )
        final_doc = await db.incidents.find_one({"_id": incident_id})
        await broadcaster.broadcast("incident_update", final_doc)
        return final_doc
